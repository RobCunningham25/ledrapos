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
