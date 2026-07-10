import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Paperclip, Trash2, Eye, Send, AlertTriangle, X, Search, FileText } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';
import BroadcastEditor from '@/components/admin/BroadcastEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { wrapWithFooter } from '@/lib/broadcastTemplate';

interface VenueInfo {
  id: string;
  name: string;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  broadcast_from_email: string | null;
  logo_url: string | null;
}

interface MemberOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  email_opt_out: boolean;
  partner_email: string | null;
}

type RecipientMode = 'all' | 'specific';

type Classification = 'pending' | 'no_email_skipped' | 'opted_out_skipped';

function classify(m: MemberOption): Classification {
  if (!m.email) return 'no_email_skipped';
  if (m.email_opt_out) return 'opted_out_skipped';
  return 'pending';
}

// Partners with their own distinct email get the broadcast too (unless the
// household is opted out). Mirrors select_broadcast_recipients server-side.
function hasPartnerRecipient(m: MemberOption): boolean {
  if (!m.partner_email || m.email_opt_out) return false;
  return m.partner_email.trim().toLowerCase() !== (m.email || '').trim().toLowerCase();
}

interface AttachmentEntry {
  path: string;
  filename: string;
  size: number;
}

interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  subject_template: string;
  body_html: string;
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

const PER_FILE_CAP = 5 * 1024 * 1024;       // 5 MB
const COMBINED_CAP = 25 * 1024 * 1024;      // 25 MB
const DAILY_QUOTA = 100;
const QUOTA_THRESHOLD = 95;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BroadcastCompose() {
  const navigate = useNavigate();
  const { venueId } = useVenue();
  const { adminPath } = useVenueNav();

  const sessionId = useMemo(() => crypto.randomUUID(), []);

  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [todaySent, setTodaySent] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<p></p>');
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);

  const [recipientMode, setRecipientMode] = useState<RecipientMode>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState('');

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<EmailTemplate | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial load: venue + active members + today's quota usage.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      const [venueRes, membersRes, templatesRes, todayRes] = await Promise.all([
        supabase
          .from('venues')
          .select('id, name, address, contact_email, contact_phone, broadcast_from_email, logo_url')
          .eq('id', venueId)
          .maybeSingle(),
        supabase
          .from('members')
          .select('id, first_name, last_name, email, email_opt_out, partner_email')
          .eq('venue_id', venueId)
          .eq('is_active', true)
          .order('last_name', { ascending: true }),
        supabase
          .from('email_templates')
          .select('id, name, description, subject_template, body_html')
          .eq('venue_id', venueId)
          .order('display_order', { ascending: true }),
        countTodaySent(venueId),
      ]);

      if (cancelled) return;

      if (venueRes.data) setVenue(venueRes.data as VenueInfo);
      if (membersRes.data) setMembers((membersRes.data as MemberOption[]) || []);
      if (templatesRes.data) setTemplates((templatesRes.data as EmailTemplate[]) || []);
      setTodaySent(todayRes);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [venueId]);

  // Members included in this send, derived from mode + selection.
  const targetedMembers = useMemo(() => {
    if (recipientMode === 'all') return members;
    return members.filter(m => selectedIds.has(m.id));
  }, [recipientMode, members, selectedIds]);

  const stats = useMemo(() => {
    let sendable = 0, noEmail = 0, optedOut = 0, partners = 0;
    for (const m of targetedMembers) {
      const c = classify(m);
      if (c === 'pending') sendable++;
      else if (c === 'no_email_skipped') noEmail++;
      else if (c === 'opted_out_skipped') optedOut++;
      if (hasPartnerRecipient(m)) partners++;
    }
    // sendable counts emails, not members — each partner email is its own send
    // against the daily Resend quota.
    return { sendable: sendable + partners, partners, noEmail, optedOut, total: targetedMembers.length };
  }, [targetedMembers]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      m.first_name.toLowerCase().includes(q) ||
      m.last_name.toLowerCase().includes(q) ||
      (m.email && m.email.toLowerCase().includes(q))
    );
  }, [members, memberSearch]);

  const toggleMember = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalAttachmentBytes = useMemo(
    () => attachments.reduce((sum, a) => sum + a.size, 0),
    [attachments],
  );

  const wouldExceedQuota = todaySent + stats.sendable > QUOTA_THRESHOLD;
  const remainingQuota = Math.max(QUOTA_THRESHOLD - todaySent, 0);

  // ===== Attachment upload =====
  const handleFiles = async (files: FileList | File[]) => {
    if (!files || (files as FileList).length === 0) return;
    setUploading(true);
    let runningTotal = totalAttachmentBytes;
    const accepted: AttachmentEntry[] = [];

    for (const file of Array.from(files)) {
      if (!ALLOWED_MIME.has(file.type)) {
        toast.error(`${file.name}: unsupported file type (${file.type || 'unknown'})`);
        continue;
      }
      if (file.size > PER_FILE_CAP) {
        toast.error(`${file.name}: exceeds 5 MB per-file limit`);
        continue;
      }
      if (runningTotal + file.size > COMBINED_CAP) {
        toast.error(`${file.name}: would exceed 25 MB combined limit`);
        continue;
      }

      const attachmentId = crypto.randomUUID();
      const path = `${venueId}/${sessionId}/${attachmentId}_${file.name}`;
      const { error } = await supabase.storage
        .from('broadcast-attachments')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        toast.error(`${file.name}: upload failed (${error.message})`);
        continue;
      }
      accepted.push({ path, filename: file.name, size: file.size });
      runningTotal += file.size;
    }

    if (accepted.length > 0) {
      setAttachments(prev => [...prev, ...accepted]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = async (path: string) => {
    const { error } = await supabase.storage.from('broadcast-attachments').remove([path]);
    if (error) {
      toast.error(`Remove failed: ${error.message}`);
      return;
    }
    setAttachments(prev => prev.filter(a => a.path !== path));
  };

  // ===== Send =====
  // ===== Templates =====
  const draftHasContent = useMemo(() => {
    if (subject.trim().length > 0) return true;
    const stripped = bodyHtml.replace(/<[^>]+>/g, '').trim();
    return stripped.length > 0;
  }, [subject, bodyHtml]);

  const applyTemplate = (t: EmailTemplate) => {
    setSubject(t.subject_template);
    setBodyHtml(t.body_html);
    setTemplatePickerOpen(false);
    setPendingTemplate(null);
    toast.success(`Loaded "${t.name}" template`);
  };

  const handleSelectTemplate = (t: EmailTemplate) => {
    if (draftHasContent) {
      setPendingTemplate(t);
    } else {
      applyTemplate(t);
    }
  };

  const validate = (): string | null => {
    if (!venue) return 'Venue not loaded';
    if (subject.trim().length === 0) return 'Subject is required';
    if (subject.length > 200) return 'Subject must be 200 characters or less';
    const stripped = bodyHtml.replace(/<[^>]+>/g, '').trim();
    if (stripped.length === 0) return 'Body is empty';
    if (recipientMode === 'specific' && selectedIds.size === 0) return 'Select at least one member';
    if (stats.sendable === 0) return 'No eligible recipients (all skipped or none selected)';
    if (wouldExceedQuota) return `Daily quota would be exceeded (${todaySent} sent today, ${stats.sendable} would be sent, limit ${QUOTA_THRESHOLD}).`;
    if (!venue.broadcast_from_email) return 'No sender email configured for this venue. Set venues.broadcast_from_email in Supabase.';
    if (!venue.address) return 'Venue address is required for the email footer (POPIA compliance). Set venues.address.';
    return null;
  };

  const handleSendClick = () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmSend = async () => {
    setConfirmOpen(false);
    setSending(true);

    try {
      const recipientFilter = recipientMode === 'specific'
        ? { member_ids: Array.from(selectedIds) }
        : {};

      const res = await supabase.functions.invoke('send-broadcast', {
        body: {
          venue_id: venueId,
          subject: subject.trim(),
          body_html: bodyHtml,
          attachment_paths: attachments.map(a => a.path),
          recipient_filter: recipientFilter,
        },
      });

      if (res.error) {
        let detail: string | null = null;
        const ctx = (res.error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
            if (body?.message) detail = body.message;
          } catch { /* not JSON */ }
        }
        toast.error(detail || res.error.message || 'Failed to send broadcast');
        setSending(false);
        return;
      }

      const broadcastId = res.data?.broadcast_id;
      const sentInRun = res.data?.totals?.sent ?? 0;
      const failedInRun = res.data?.totals?.failed ?? 0;

      if (failedInRun > 0) {
        toast.warning(`Sent ${sentInRun}, failed ${failedInRun}. Check the broadcast detail.`);
      } else {
        toast.success(`Broadcast sent to ${sentInRun} member${sentInRun === 1 ? '' : 's'}`);
      }

      if (broadcastId) {
        navigate(adminPath(`broadcasts/${broadcastId}`));
      } else {
        navigate(adminPath('broadcasts'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send broadcast');
      setSending(false);
    }
  };

  // ===== Preview rendering =====
  const previewHtml = useMemo(() => {
    if (!venue) return '';
    const wrapped = wrapWithFooter({
      subject: subject || '(no subject)',
      bodyHtml,
      venueName: venue.name,
      venueAddress: venue.address,
      logoUrl: venue.logo_url,
      contactPhone: venue.contact_phone,
      unsubscribeUrl: 'https://pos.ledra.co.za/unsubscribed?status=updated&venue=Preview',
    });
    return wrapped.html;
  }, [venue, subject, bodyHtml]);

  return (
    <AdminLayout title="Compose Broadcast">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ===== Main column ===== */}
        <div className="space-y-5">
          {templates.length > 0 && (
            <div className="flex items-center justify-between rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">
                Need a starting point? Pick a template to pre-fill the subject and body.
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTemplatePickerOpen(true)}
                disabled={sending}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Start from template
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. AGM notice and agenda"
              maxLength={200}
              disabled={sending}
            />
            <div className="text-xs text-muted-foreground">
              {subject.length}/200
            </div>
          </div>

          <div className="space-y-2">
            <Label>Body</Label>
            <BroadcastEditor value={bodyHtml} onChange={setBodyHtml} />
            <div className="text-xs text-muted-foreground">
              Tip: keep it short. The footer (venue address, unsubscribe link) is added automatically.
            </div>
          </div>

          <div className="space-y-2">
            <Label>Attachments</Label>
            <DropZone
              onFiles={handleFiles}
              disabled={uploading || sending}
              onClick={() => fileInputRef.current?.click()}
              currentBytes={totalAttachmentBytes}
              uploading={uploading}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              accept={Array.from(ALLOWED_MIME).join(',')}
              style={{ display: 'none' }}
            />
            {attachments.length > 0 && (
              <ul className="space-y-1.5">
                {attachments.map(a => (
                  <li key={a.path} className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip size={14} className="text-muted-foreground shrink-0" />
                      <span className="truncate">{a.filename}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatBytes(a.size)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.path)}
                      disabled={sending}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              disabled={!venue || sending}
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button
              type="button"
              onClick={handleSendClick}
              disabled={loading || sending || stats.sendable === 0 || wouldExceedQuota}
              style={{ background: '#2A9D8F', color: '#FFFFFF', fontWeight: 600 }}
            >
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {sending ? 'Sending...' : `Send to ${stats.sendable} recipient${stats.sendable === 1 ? '' : 's'}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(adminPath('broadcasts'))}
              disabled={sending}
            >
              Cancel
            </Button>
          </div>
        </div>

        {/* ===== Sidebar ===== */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground mb-3">Recipients</div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5 mb-3 text-xs font-medium">
              <button
                type="button"
                onClick={() => setRecipientMode('all')}
                className={`rounded px-2 py-1.5 transition-colors ${
                  recipientMode === 'all' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All members
              </button>
              <button
                type="button"
                onClick={() => setRecipientMode('specific')}
                className={`rounded px-2 py-1.5 transition-colors ${
                  recipientMode === 'specific' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Pick specific
              </button>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <>
                <div className="text-2xl font-semibold" style={{ color: '#1B3A4B' }}>
                  {stats.sendable}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {recipientMode === 'all'
                    ? `email${stats.sendable === 1 ? '' : 's'} to active members with email, not opted-out`
                    : `email${stats.sendable === 1 ? '' : 's'} will be sent for the selected members`}
                </div>
                {(stats.noEmail > 0 || stats.optedOut > 0 || stats.partners > 0) && (
                  <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs text-muted-foreground">
                    {stats.partners > 0 && <div>includes {stats.partners} partner email{stats.partners === 1 ? '' : 's'}</div>}
                    {stats.noEmail > 0 && <div>{stats.noEmail} skipped — no email</div>}
                    {stats.optedOut > 0 && <div>{stats.optedOut} skipped — opted out</div>}
                  </div>
                )}

                {recipientMode === 'specific' && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search members..."
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                      <span>{selectedIds.size} selected</span>
                      {selectedIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedIds(new Set())}
                          className="text-primary hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <ul className="max-h-[280px] overflow-y-auto rounded-md border border-border divide-y divide-border bg-background">
                      {filteredMembers.length === 0 && (
                        <li className="px-3 py-4 text-xs text-center text-muted-foreground">
                          No matches
                        </li>
                      )}
                      {filteredMembers.map(m => {
                        const checked = selectedIds.has(m.id);
                        const c = classify(m);
                        const skipReason = c === 'no_email_skipped' ? 'no email'
                          : c === 'opted_out_skipped' ? 'opted out'
                          : null;
                        return (
                          <li key={m.id}>
                            <label className="flex items-start gap-2 px-2.5 py-2 cursor-pointer hover:bg-muted/40 transition-colors">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleMember(m.id)}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-input"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-foreground truncate">
                                  {m.first_name} {m.last_name}
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {m.email || <span className="italic">no email</span>}
                                  {skipReason && checked && (
                                    <span style={{ color: '#991B1B' }}> · skipped ({skipReason})</span>
                                  )}
                                </div>
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground mb-2">Daily quota</div>
            <div className="text-sm">
              <span className="font-medium" style={{ color: wouldExceedQuota ? '#991B1B' : '#0F172A' }}>
                {todaySent}
              </span>
              <span className="text-muted-foreground"> / {DAILY_QUOTA} sent today</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min((todaySent / DAILY_QUOTA) * 100, 100)}%`,
                  background: wouldExceedQuota ? '#DC2626' : '#2A9D8F',
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {remainingQuota} send{remainingQuota === 1 ? '' : 's'} left today
              <span className="block">(Resend free tier resets at UTC midnight)</span>
            </div>
            {wouldExceedQuota && (
              <div className="mt-3 flex items-start gap-2 text-xs" style={{ color: '#991B1B' }}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>This send ({stats.sendable}) plus today's total ({todaySent}) would exceed the {QUOTA_THRESHOLD} threshold. Try again tomorrow.</span>
              </div>
            )}
          </div>

          {venue && (
            <div className="rounded-lg border border-border bg-card p-4 text-xs space-y-1.5">
              <div className="text-sm font-semibold text-foreground mb-2">From</div>
              <div className="text-foreground">
                {venue.name} &lt;{venue.broadcast_from_email || '(not configured)'}&gt;
              </div>
              {venue.contact_email && (
                <div className="text-muted-foreground">Reply-to: {venue.contact_email}</div>
              )}
              {!venue.address && (
                <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-border" style={{ color: '#991B1B' }}>
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>No venue address — required for footer.</span>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ===== Template picker ===== */}
      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose a template</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {templates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTemplate(t)}
                className="w-full text-left rounded-md border border-border bg-card hover:border-primary hover:bg-primary/5 transition-colors px-4 py-3"
              >
                <div className="text-sm font-semibold text-foreground">{t.name}</div>
                {t.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Replace-draft confirm ===== */}
      <AlertDialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your current draft?</AlertDialogTitle>
            <AlertDialogDescription>
              You've already started writing. Loading the <strong>"{pendingTemplate?.name}"</strong> template will overwrite your current subject and body.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTemplate(null)}>Keep my draft</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingTemplate && applyTemplate(pendingTemplate)}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Preview modal ===== */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2 flex flex-row items-center justify-between">
            <DialogTitle>Email preview</DialogTitle>
            <button onClick={() => setPreviewOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </DialogHeader>
          <div className="px-6 pb-6 overflow-auto flex-1">
            <div className="text-xs text-muted-foreground mb-2">
              Subject: <span className="font-medium text-foreground">{subject || '(no subject)'}</span>
            </div>
            <iframe
              srcDoc={previewHtml}
              title="Email preview"
              sandbox=""
              className="w-full rounded border border-border bg-white"
              style={{ height: '60vh' }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Confirm dialog ===== */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send broadcast?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  Sending <strong>"{subject}"</strong> to <strong>{stats.sendable}</strong> recipient{stats.sendable === 1 ? '' : 's'}{stats.partners > 0 ? ` (including ${stats.partners} partner email${stats.partners === 1 ? '' : 's'})` : ''}.
                </div>
                {attachments.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    With {attachments.length} attachment{attachments.length === 1 ? '' : 's'} ({formatBytes(totalAttachmentBytes)} total).
                  </div>
                )}
                {(stats.noEmail > 0 || stats.optedOut > 0) && (
                  <div className="text-sm text-muted-foreground">
                    Skipping {stats.noEmail + stats.optedOut} (no email or opted out).
                  </div>
                )}
                <div className="text-sm text-muted-foreground pt-1 border-t border-border mt-2">
                  This will use {stats.sendable} of your remaining {remainingQuota} daily Resend quota.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSend} style={{ background: '#2A9D8F' }}>
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

// ===== Helpers =====

async function countTodaySent(venueId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('broadcast_recipients')
    .select('id, email_broadcasts!inner(venue_id)', { count: 'exact', head: true })
    .eq('status', 'sent')
    .eq('email_broadcasts.venue_id', venueId)
    .gte('sent_at', todayStart.toISOString());

  if (error) {
    console.error('quota count failed:', error.message);
    return 0;
  }
  return count ?? 0;
}

function DropZone({
  onFiles,
  onClick,
  disabled,
  uploading,
  currentBytes,
}: {
  onFiles: (files: FileList) => void;
  onClick: () => void;
  disabled: boolean;
  uploading: boolean;
  currentBytes: number;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onFiles(e.dataTransfer.files);
        }
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed cursor-pointer px-4 py-8 transition-colors ${
        isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50'}`}
    >
      {uploading ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Uploading…</div>
        </>
      ) : (
        <>
          <Paperclip className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm">
            <span className="font-medium text-foreground">Click to upload</span>
            <span className="text-muted-foreground"> or drag and drop</span>
          </div>
          <div className="text-xs text-muted-foreground">
            PDF, images, Office docs · 5 MB per file · {formatBytes(currentBytes)} / 25 MB used
          </div>
        </>
      )}
    </div>
  );
}
