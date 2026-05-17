import { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useVenue } from '@/contexts/VenueContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VenueAiSettings {
  whatsapp_ai_enabled: boolean;
  whatsapp_ai_daily_cap: number;
  whatsapp_ai_model: string;
}

interface VenueDocument {
  id: string;
  kind: 'constitution' | 'club_rules';
  title: string;
  content_markdown: string;
  updated_at: string;
}

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

interface ConversationMember {
  member_id: string;
  first_name: string | null;
  last_name: string | null;
  membership_number: string | null;
  last_message_at: string;
}

interface ConversationMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  related_kind: string | null;
  status: string;
  error: string | null;
  created_at: string;
  template_sid: string | null;
}

const DOC_KINDS: VenueDocument['kind'][] = ['constitution', 'club_rules'];

export default function WhatsAppAssistant() {
  const { venueId } = useVenue();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<VenueAiSettings>({
    whatsapp_ai_enabled: false,
    whatsapp_ai_daily_cap: 200,
    whatsapp_ai_model: 'claude-haiku-4-5-20251001',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const [docs, setDocs] = useState<Record<string, VenueDocument>>({});
  const [savingDoc, setSavingDoc] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberLite[]>([]);
  const [testMemberId, setTestMemberId] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<DryRunResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConversationMember[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [selectedConvMemberId, setSelectedConvMemberId] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [venueRes, docsRes, membersRes] = await Promise.all([
        supabase
          .from('venues')
          .select('whatsapp_ai_enabled, whatsapp_ai_daily_cap, whatsapp_ai_model')
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

  const loadConversations = async () => {
    setConversationsLoading(true);
    // Pull recent whatsapp_messages with member_id, group client-side to get the
    // most-recently-active distinct members.
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('member_id, created_at')
      .eq('venue_id', venueId)
      .not('member_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);
    const seen = new Map<string, string>();
    for (const row of (data ?? []) as Array<{ member_id: string; created_at: string }>) {
      if (!seen.has(row.member_id)) seen.set(row.member_id, row.created_at);
    }
    const memberIds = Array.from(seen.keys()).slice(0, 30);
    if (memberIds.length === 0) {
      setConversations([]);
      setConversationsLoading(false);
      return;
    }
    const { data: memberRows } = await supabase
      .from('members')
      .select('id, first_name, last_name, membership_number')
      .in('id', memberIds);
    const byId = new Map(
      ((memberRows ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; membership_number: string | null }>)
        .map((m) => [m.id, m]),
    );
    const convs: ConversationMember[] = memberIds.map((id) => {
      const m = byId.get(id);
      return {
        member_id: id,
        first_name: m?.first_name ?? null,
        last_name: m?.last_name ?? null,
        membership_number: m?.membership_number ?? null,
        last_message_at: seen.get(id)!,
      };
    });
    setConversations(convs);
    if (!selectedConvMemberId && convs.length > 0) {
      setSelectedConvMemberId(convs[0].member_id);
    }
    setConversationsLoading(false);
  };

  const loadMessagesForMember = async (memberId: string) => {
    setMessagesLoading(true);
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('id, direction, body, related_kind, status, error, created_at, template_sid')
      .eq('venue_id', venueId)
      .eq('member_id', memberId)
      .order('created_at', { ascending: true })
      .limit(200);
    setConversationMessages(((data ?? []) as ConversationMessage[]));
    setMessagesLoading(false);
  };

  useEffect(() => {
    if (!venueId) return;
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  useEffect(() => {
    if (!venueId || !selectedConvMemberId) return;
    loadMessagesForMember(selectedConvMemberId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConvMemberId, venueId]);

  const convMemberLabel = (c: ConversationMember) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown member';
    return c.membership_number ? `${name} (#${c.membership_number})` : name;
  };

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-ZA', {
        timeZone: 'Africa/Johannesburg',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  // Categorise a row for rendering. The same body field carries: member text,
  // assistant text, tool-call summaries, error notes, and template sends.
  const classifyMessage = (m: ConversationMessage) => {
    const kind = m.related_kind ?? '';
    if (m.direction === 'inbound') {
      return { lane: 'member' as const, label: 'Member' };
    }
    if (kind === 'ai_reply') return { lane: 'assistant' as const, label: 'Assistant' };
    if (kind === 'ai_tool_call') return { lane: 'tool' as const, label: 'Tool call' };
    if (kind === 'ai_error') return { lane: 'error' as const, label: 'Assistant error' };
    if (kind === 'optin_reply' || kind === 'optout_reply' || kind === 'portal_reply' || kind === 'link_request' || kind === 'link_request_failed' || kind === 'link_request_settled') {
      return { lane: 'assistant' as const, label: 'Reply' };
    }
    if (m.template_sid || kind === 'tab_reminder' || kind === 'optin_invite' || kind === 'broadcast' || kind?.startsWith('template')) {
      return { lane: 'system' as const, label: 'Template send' };
    }
    return { lane: 'system' as const, label: kind || 'outbound' };
  };

  const laneStyles: Record<string, string> = {
    member: 'bg-blue-50 border-blue-200',
    assistant: 'bg-emerald-50 border-emerald-200',
    tool: 'bg-amber-50 border-amber-200 font-mono text-xs',
    error: 'bg-red-50 border-red-200',
    system: 'bg-muted/40 border-border',
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

          {/* === Recent conversations === */}
          <section className="bg-card rounded-lg border border-border p-6">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-base font-semibold">Recent conversations</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Live WhatsApp activity per member: inbound messages, assistant replies, tool calls,
                  template sends, and errors. Tool calls show the one-line summary the assistant
                  logged — for full tool input/output, use the dry-run tester below.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadConversations();
                  if (selectedConvMemberId) loadMessagesForMember(selectedConvMemberId);
                }}
              >
                Refresh
              </Button>
            </div>

            {conversations.length === 0 && !conversationsLoading && (
              <p className="text-sm text-muted-foreground mt-4">
                No WhatsApp activity yet for this venue.
              </p>
            )}

            {conversations.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 mt-4">
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border bg-muted/30">
                    Recently active members
                  </div>
                  <div className="max-h-[480px] overflow-y-auto divide-y divide-border">
                    {conversations.map((c) => {
                      const isActive = c.member_id === selectedConvMemberId;
                      return (
                        <button
                          key={c.member_id}
                          type="button"
                          onClick={() => setSelectedConvMemberId(c.member_id)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/40 ${
                            isActive ? 'bg-muted/60' : ''
                          }`}
                        >
                          <div className="font-medium truncate">{convMemberLabel(c)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatTimestamp(c.last_message_at)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border border-border rounded-md p-3 max-h-[480px] overflow-y-auto">
                  {messagesLoading && (
                    <p className="text-xs text-muted-foreground">Loading messages…</p>
                  )}
                  {!messagesLoading && conversationMessages.length === 0 && (
                    <p className="text-xs text-muted-foreground">No messages.</p>
                  )}
                  <div className="space-y-2">
                    {conversationMessages.map((m) => {
                      const c = classifyMessage(m);
                      return (
                        <div
                          key={m.id}
                          className={`rounded-md border px-3 py-2 text-sm ${laneStyles[c.lane]}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-semibold uppercase tracking-wide">
                              {c.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(m.created_at)}
                              {m.status && m.status !== 'delivered' ? ` · ${m.status}` : ''}
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap break-words">
                            {m.body || (m.template_sid ? `[template ${m.template_sid}]` : '[no body]')}
                          </div>
                          {m.error && (
                            <div className="text-xs text-red-700 mt-1">Error: {m.error}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
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
