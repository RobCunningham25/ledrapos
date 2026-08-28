import { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';

interface VenueAiSettings {
  whatsapp_ai_enabled: boolean;
  whatsapp_ai_daily_cap: number;
  whatsapp_ai_model: string;
  whatsapp_staff_alert_number: string;
}

interface VenueDocument {
  id: string;
  kind: 'constitution' | 'club_rules';
  title: string;
  content_markdown: string;
  updated_at: string;
}

interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  body: string;
  keywords: string;
  tags: string[];
  source: string | null;
  priority: number;
  is_published: boolean;
  updated_at: string;
}

const emptyEntry = (): KnowledgeEntry => ({
  id: '',
  category: 'general',
  title: '',
  body: '',
  keywords: '',
  tags: [],
  source: '',
  priority: 0,
  is_published: true,
  updated_at: '',
});

interface MemberLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  membership_number: string | null;
}

interface DryRunResult {
  reply: string;
  stop_reason: string;
  trace: Array<{ tool: string; input: unknown; output: unknown }>;
}

const DOC_KINDS: VenueDocument['kind'][] = ['constitution', 'club_rules'];

export default function WhatsAppAssistant() {
  const { venueId } = useVenue();
  const { adminPath } = useVenueNav();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<VenueAiSettings>({
    whatsapp_ai_enabled: false,
    whatsapp_ai_daily_cap: 200,
    whatsapp_ai_model: 'claude-haiku-4-5-20251001',
    whatsapp_staff_alert_number: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const [docs, setDocs] = useState<Record<string, VenueDocument>>({});
  const [savingDoc, setSavingDoc] = useState<string | null>(null);

  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeFilter, setKnowledgeFilter] = useState('');
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [editTagsText, setEditTagsText] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);

  const [members, setMembers] = useState<MemberLite[]>([]);
  const [testMemberId, setTestMemberId] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<DryRunResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [venueRes, docsRes, membersRes] = await Promise.all([
        supabase
          .from('venues')
          .select('whatsapp_ai_enabled, whatsapp_ai_daily_cap, whatsapp_ai_model, whatsapp_staff_alert_number')
          .eq('id', venueId)
          .maybeSingle(),
        supabase
          .from('venue_documents')
          .select('id, kind, title, content_markdown, updated_at')
          .eq('venue_id', venueId),
        supabase
          .from('members')
          .select('id, first_name, last_name, membership_number')
          .eq('venue_id', venueId)
          .eq('is_active', true)
          .order('first_name'),
      ]);

      if (cancelled) return;

      if (venueRes.data) {
        setSettings({
          whatsapp_ai_enabled: !!venueRes.data.whatsapp_ai_enabled,
          whatsapp_ai_daily_cap: venueRes.data.whatsapp_ai_daily_cap ?? 200,
          whatsapp_ai_model: venueRes.data.whatsapp_ai_model ?? 'claude-haiku-4-5-20251001',
          whatsapp_staff_alert_number: venueRes.data.whatsapp_staff_alert_number ?? '',
        });
      }

      const docMap: Record<string, VenueDocument> = {};
      for (const d of (docsRes.data ?? []) as VenueDocument[]) {
        docMap[d.kind] = d;
      }
      // Ensure both kinds exist locally even if rows are missing.
      for (const kind of DOC_KINDS) {
        if (!docMap[kind]) {
          docMap[kind] = {
            id: '',
            kind,
            title: kind === 'constitution' ? 'Constitution' : 'Club Rules',
            content_markdown: '',
            updated_at: '',
          };
        }
      }
      setDocs(docMap);

      const memberList = (membersRes.data ?? []) as MemberLite[];
      setMembers(memberList);
      if (memberList.length > 0) setTestMemberId(memberList[0].id);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [venueId]);

  const saveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase
      .from('venues')
      .update({
        whatsapp_ai_enabled: settings.whatsapp_ai_enabled,
        whatsapp_ai_daily_cap: settings.whatsapp_ai_daily_cap,
        whatsapp_ai_model: settings.whatsapp_ai_model,
        whatsapp_staff_alert_number: settings.whatsapp_staff_alert_number.trim() || null,
      })
      .eq('id', venueId);
    setSavingSettings(false);
    if (error) {
      toast.error('Failed to save settings: ' + error.message);
    } else {
      toast.success('Assistant settings saved.');
    }
  };

  const saveDocument = async (kind: VenueDocument['kind']) => {
    const doc = docs[kind];
    if (!doc) return;
    setSavingDoc(kind);
    const { error } = await supabase
      .from('venue_documents')
      .upsert(
        {
          id: doc.id || undefined,
          venue_id: venueId,
          kind,
          title: doc.title,
          content_markdown: doc.content_markdown,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'venue_id,kind' },
      )
      .select('id, updated_at')
      .single();
    setSavingDoc(null);
    if (error) {
      toast.error(`Failed to save ${kind}: ${error.message}`);
    } else {
      toast.success(`${doc.title} saved.`);
    }
  };

  const loadKnowledge = async () => {
    setKnowledgeLoading(true);
    const { data, error } = await supabase
      .from('venue_knowledge')
      .select('id, category, title, body, keywords, tags, source, priority, is_published, updated_at')
      .eq('venue_id', venueId)
      .order('category', { ascending: true })
      .order('priority', { ascending: false })
      .order('title', { ascending: true });
    if (error) {
      toast.error('Failed to load knowledge base: ' + error.message);
    } else {
      setKnowledge((data ?? []) as KnowledgeEntry[]);
    }
    setKnowledgeLoading(false);
  };

  useEffect(() => {
    if (!venueId) return;
    loadKnowledge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  const startNewEntry = () => {
    setEditingEntry(emptyEntry());
    setEditTagsText('');
  };

  const startEditEntry = (entry: KnowledgeEntry) => {
    setEditingEntry({ ...entry });
    setEditTagsText((entry.tags ?? []).join(', '));
  };

  const cancelEditEntry = () => {
    setEditingEntry(null);
    setEditTagsText('');
  };

  const saveEntry = async () => {
    if (!editingEntry) return;
    const title = editingEntry.title.trim();
    if (!title) {
      toast.error('Title is required.');
      return;
    }
    const tags = editTagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const payload = {
      venue_id: venueId,
      category: editingEntry.category.trim() || 'general',
      title,
      body: editingEntry.body,
      keywords: editingEntry.keywords,
      tags,
      source: editingEntry.source?.trim() || null,
      priority: Number.isFinite(editingEntry.priority) ? editingEntry.priority : 0,
      is_published: editingEntry.is_published,
    };
    setSavingEntry(true);
    const { error } = editingEntry.id
      ? await supabase.from('venue_knowledge').update(payload).eq('id', editingEntry.id)
      : await supabase.from('venue_knowledge').insert(payload);
    setSavingEntry(false);
    if (error) {
      toast.error('Failed to save entry: ' + error.message);
      return;
    }
    toast.success(editingEntry.id ? 'Entry updated.' : 'Entry added.');
    cancelEditEntry();
    loadKnowledge();
  };

  const deleteEntry = async (entry: KnowledgeEntry) => {
    if (!confirm(`Delete "${entry.title}"? This can't be undone.`)) return;
    const { error } = await supabase.from('venue_knowledge').delete().eq('id', entry.id);
    if (error) {
      toast.error('Failed to delete: ' + error.message);
      return;
    }
    toast.success('Entry deleted.');
    if (editingEntry?.id === entry.id) cancelEditEntry();
    loadKnowledge();
  };

  const runDryRun = async () => {
    if (!testMessage.trim() || !testMemberId) return;
    setTestRunning(true);
    setTestResult(null);
    setTestError(null);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-ai-reply', {
        body: {
          venue_id: venueId,
          member_id: testMemberId,
          inbound_body: testMessage,
          inbound_message_sid: `dryrun-${Date.now()}`,
          dry_run: true,
        },
      });
      if (error) {
        setTestError(error.message);
      } else {
        setTestResult(data as DryRunResult);
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestRunning(false);
    }
  };

  const memberLabel = (m: MemberLite) => {
    const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Unnamed';
    return m.membership_number ? `${name} (#${m.membership_number})` : name;
  };

  return (
    <AdminLayout title="WhatsApp Assistant">
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* === Settings === */}
          <section className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-base font-semibold mb-4">Assistant settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="ai-enabled" className="text-sm font-medium">Enable AI replies</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When on, unmatched WhatsApp messages from members are answered by Claude Haiku.
                  </p>
                </div>
                <Switch
                  id="ai-enabled"
                  checked={settings.whatsapp_ai_enabled}
                  onCheckedChange={(v) => setSettings(s => ({ ...s, whatsapp_ai_enabled: v }))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ai-cap" className="text-sm font-medium">Daily AI cap</Label>
                  <Input
                    id="ai-cap"
                    type="number"
                    min={0}
                    value={settings.whatsapp_ai_daily_cap}
                    onChange={(e) => setSettings(s => ({
                      ...s,
                      whatsapp_ai_daily_cap: Number(e.target.value) || 0,
                    }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Max AI replies per day before Haiku calls are skipped.
                  </p>
                </div>
                <div>
                  <Label htmlFor="ai-model" className="text-sm font-medium">Model</Label>
                  <Input
                    id="ai-model"
                    value={settings.whatsapp_ai_model}
                    onChange={(e) => setSettings(s => ({ ...s, whatsapp_ai_model: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Anthropic model ID. Default: claude-haiku-4-5-20251001.
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="staff-alert-number" className="text-sm font-medium">Staff WhatsApp alert number</Label>
                <Input
                  id="staff-alert-number"
                  value={settings.whatsapp_staff_alert_number}
                  onChange={(e) => setSettings(s => ({ ...s, whatsapp_staff_alert_number: e.target.value }))}
                  placeholder="+27821234567"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Gets a best-effort WhatsApp ping whenever a new follow-up is logged (any urgency).
                  This only lands if this number has messaged the club's WhatsApp number within the
                  last 24 hours — the email alert (to the venue's contact email) is the reliable
                  channel and always fires regardless of this setting.
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings ? 'Saving…' : 'Save settings'}
                </Button>
              </div>
            </div>
          </section>

          {/* === Knowledge documents === */}
          <section className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-base font-semibold mb-1">Knowledge documents</h3>
            <p className="text-xs text-muted-foreground mb-4">
              The assistant retrieves these via the read_constitution and read_club_rules tools.
              Plain text or markdown — the model will read the whole document when called.
            </p>
            <Tabs defaultValue="constitution">
              <TabsList>
                <TabsTrigger value="constitution">Constitution</TabsTrigger>
                <TabsTrigger value="club_rules">Club Rules</TabsTrigger>
              </TabsList>
              {DOC_KINDS.map((kind) => (
                <TabsContent key={kind} value={kind} className="space-y-3 mt-4">
                  <div>
                    <Label className="text-sm font-medium">Title</Label>
                    <Input
                      value={docs[kind]?.title ?? ''}
                      onChange={(e) => setDocs(d => ({
                        ...d,
                        [kind]: { ...d[kind], title: e.target.value },
                      }))}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Content</Label>
                    <Textarea
                      rows={20}
                      value={docs[kind]?.content_markdown ?? ''}
                      onChange={(e) => setDocs(d => ({
                        ...d,
                        [kind]: { ...d[kind], content_markdown: e.target.value },
                      }))}
                      placeholder="Paste the full document text here…"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {docs[kind]?.updated_at
                        ? `Last updated ${new Date(docs[kind].updated_at).toLocaleString()}`
                        : 'Not yet saved.'}
                    </p>
                    <Button
                      onClick={() => saveDocument(kind)}
                      disabled={savingDoc === kind}
                      variant="default"
                    >
                      {savingDoc === kind ? 'Saving…' : `Save ${docs[kind]?.title ?? kind}`}
                    </Button>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </section>

          {/* === Knowledge base (searchable) === */}
          <section className="bg-card rounded-lg border border-border p-6">
            <div className="flex items-start justify-between mb-1 gap-4">
              <div>
                <h3 className="text-base font-semibold">Knowledge base (searchable)</h3>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
                  Small, answer-sized entries the assistant retrieves with the search_knowledge tool —
                  it fetches only the few that match a question, so this can grow large without making
                  replies expensive. Add facilities, hours, fees, procedures, FAQs, contacts, history.
                </p>
              </div>
              <Button size="sm" onClick={startNewEntry} disabled={!!editingEntry}>
                + Add entry
              </Button>
            </div>

            {/* Editor */}
            {editingEntry && (
              <div className="mt-4 rounded-md border border-primary/40 bg-muted/20 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {editingEntry.id ? 'Edit entry' : 'New entry'}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3">
                  <div>
                    <Label className="text-sm font-medium">Title</Label>
                    <Input
                      value={editingEntry.title}
                      onChange={(e) => setEditingEntry(e2 => e2 && { ...e2, title: e.target.value })}
                      placeholder="e.g. Slipway launch hours"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Category</Label>
                    <Input
                      value={editingEntry.category}
                      onChange={(e) => setEditingEntry(e2 => e2 && { ...e2, category: e.target.value })}
                      placeholder="facilities"
                      list="knowledge-categories"
                    />
                    <datalist id="knowledge-categories">
                      {Array.from(new Set(knowledge.map(k => k.category))).map(c => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Answer (body)</Label>
                  <Textarea
                    rows={5}
                    value={editingEntry.body}
                    onChange={(e) => setEditingEntry(e2 => e2 && { ...e2, body: e.target.value })}
                    placeholder="The answer the assistant will draw from. Keep it self-contained, ~50–250 words, plain language."
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Keywords / synonyms</Label>
                  <Input
                    value={editingEntry.keywords}
                    onChange={(e) => setEditingEntry(e2 => e2 && { ...e2, keywords: e.target.value })}
                    placeholder="opening times, closing time, when does the bar open, last call"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Alternate phrasings members might use — boosts search recall. Free text.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-sm font-medium">Tags</Label>
                    <Input
                      value={editTagsText}
                      onChange={(e) => setEditTagsText(e.target.value)}
                      placeholder="slipway, launch"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Comma-separated.</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Source</Label>
                    <Input
                      value={editingEntry.source ?? ''}
                      onChange={(e) => setEditingEntry(e2 => e2 && { ...e2, source: e.target.value })}
                      placeholder="e.g. committee handover"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Priority</Label>
                    <Input
                      type="number"
                      value={editingEntry.priority}
                      onChange={(e) => setEditingEntry(e2 => e2 && { ...e2, priority: Number(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Higher wins ties.</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="entry-published"
                      checked={editingEntry.is_published}
                      onCheckedChange={(v) => setEditingEntry(e2 => e2 && { ...e2, is_published: v })}
                    />
                    <Label htmlFor="entry-published" className="text-sm">
                      Published {editingEntry.is_published ? '(searchable)' : '(hidden from assistant)'}
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={cancelEditEntry} disabled={savingEntry}>
                      Cancel
                    </Button>
                    <Button onClick={saveEntry} disabled={savingEntry}>
                      {savingEntry ? 'Saving…' : editingEntry.id ? 'Save changes' : 'Add entry'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Filter + list */}
            <div className="mt-4">
              {knowledge.length > 0 && (
                <Input
                  value={knowledgeFilter}
                  onChange={(e) => setKnowledgeFilter(e.target.value)}
                  placeholder="Filter entries by title, category, or keyword…"
                  className="mb-3"
                />
              )}

              {knowledgeLoading && (
                <p className="text-sm text-muted-foreground">Loading knowledge base…</p>
              )}

              {!knowledgeLoading && knowledge.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No entries yet. The assistant will say it doesn't have club info on file until you
                  add some. Click “Add entry” to start.
                </p>
              )}

              <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
                {knowledge
                  .filter((k) => {
                    const q = knowledgeFilter.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      k.title.toLowerCase().includes(q) ||
                      k.category.toLowerCase().includes(q) ||
                      k.keywords.toLowerCase().includes(q) ||
                      (k.tags ?? []).some((t) => t.toLowerCase().includes(q))
                    );
                  })
                  .map((k) => (
                    <div key={k.id} className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-muted/30">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{k.title}</span>
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {k.category}
                          </span>
                          {!k.is_published && (
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              Draft
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{k.body}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => startEditEntry(k)} disabled={!!editingEntry}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteEntry(k)}
                          className="text-red-600 hover:text-red-700"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </section>

          {/* === Live conversations pointer === */}
          <section className="bg-card rounded-lg border border-border p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold">Live conversations</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Viewing, replying to, and taking over member/prospect WhatsApp conversations now
                  lives on its own page, with a persistent list and a dot for anything waiting on you.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={adminPath('whatsapp/followups')}>Open WhatsApp Follow-ups</Link>
              </Button>
            </div>
          </section>

          {/* === Test in chat === */}
          <section className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-base font-semibold mb-1">Test in chat (dry run)</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Sends a message to the assistant as if it came from the selected member. Skips the
              daily cap, doesn't send WhatsApp, and shows the tool calls Haiku made.
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Test as member</Label>
                  <select
                    className="w-full border border-input rounded-md h-10 px-3 text-sm bg-background"
                    value={testMemberId}
                    onChange={(e) => setTestMemberId(e.target.value)}
                  >
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{memberLabel(m)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Inbound message</Label>
                <Textarea
                  rows={3}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="e.g. what's my bar tab?"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={runDryRun} disabled={testRunning || !testMessage.trim()}>
                  {testRunning ? 'Running…' : 'Run dry run'}
                </Button>
              </div>

              {testError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  Error: {testError}
                </div>
              )}

              {testResult && (
                <div className="space-y-3">
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">
                      Assistant reply ({testResult.stop_reason})
                    </div>
                    <div className="whitespace-pre-wrap text-sm">{testResult.reply}</div>
                  </div>
                  {testResult.trace.length > 0 && (
                    <details className="rounded-md border border-border p-3">
                      <summary className="text-xs font-semibold text-muted-foreground cursor-pointer">
                        Tool calls ({testResult.trace.length})
                      </summary>
                      <div className="mt-2 space-y-2">
                        {testResult.trace.map((t, i) => (
                          <div key={i} className="text-xs font-mono">
                            <div className="font-semibold">{i + 1}. {t.tool}</div>
                            <div className="text-muted-foreground">
                              input: {JSON.stringify(t.input)}
                            </div>
                            <div className="text-muted-foreground">
                              output: {JSON.stringify(t.output)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
