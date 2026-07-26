import { useRef, useState } from 'react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, ImagePlus, Loader2, X, Check, MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';

type Category = 'issue' | 'suggestion' | 'other';

interface PickedPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

const CATEGORY_OPTIONS: { value: Category; label: string; hint: string }[] = [
  { value: 'issue', label: 'Report an issue', hint: 'Something broken or needing attention' },
  { value: 'suggestion', label: 'Make a suggestion', hint: 'An idea to improve the club' },
  { value: 'other', label: 'Something else', hint: 'Anything else you want to tell us' },
];

const MAX_PHOTOS = 6;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export default function PortalReportIssue() {
  const { member } = usePortalAuth();
  const venueId = member?.venue_id;
  const memberId = member?.id;

  const [category, setCategory] = useState<Category>('issue');
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    setPhotos((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= MAX_PHOTOS) {
          toast.error(`You can attach up to ${MAX_PHOTOS} photos.`);
          break;
        }
        if (!ALLOWED_MIME.has(file.type) && !file.type.startsWith('image/')) {
          toast.error(`${file.name} is not a supported image.`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name} is larger than 10 MB.`);
          continue;
        }
        next.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
      }
      return next;
    });
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleSubmit = async () => {
    if (!venueId) return;
    if (!message.trim()) {
      toast.error('Please describe the issue or suggestion.');
      return;
    }
    setSubmitting(true);
    try {
      // Upload photos first (private bucket) — collect their storage paths.
      const attachmentPaths: string[] = [];
      for (const photo of photos) {
        const ext = photo.file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${venueId}/${memberId ?? 'anon'}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('issue-attachments')
          .upload(path, photo.file, { contentType: photo.file.type || undefined, upsert: false });
        if (uploadErr) throw new Error('Photo upload failed: ' + uploadErr.message);
        attachmentPaths.push(path);
      }

      const { error: fnErr } = await supabase.functions.invoke('submit-issue-report', {
        body: {
          venue_id: venueId,
          member_id: memberId ?? null,
          category,
          message: message.trim(),
          attachment_paths: attachmentPaths,
        },
      });
      if (fnErr) throw fnErr;

      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPhotos([]);
      setMessage('');
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      toast.error('Could not send your report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--portal-card-bg)',
    borderRadius: 'var(--portal-card-radius)',
    border: '1px solid var(--portal-card-border)',
    padding: 20,
    marginBottom: 16,
    boxShadow: 'var(--portal-card-shadow)',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: 'var(--portal-text-secondary)',
    marginBottom: 8, display: 'block',
  };

  if (submitted) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 24px' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'rgba(42,157,143,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
          }}>
            <Check size={32} color="var(--portal-accent)" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--portal-text-primary)', marginBottom: 8 }}>
            Thank you!
          </h2>
          <p style={{ fontSize: 15, color: 'var(--portal-text-secondary)', lineHeight: 1.55, marginBottom: 24 }}>
            Your message has been sent to the committee. We appreciate you taking the time to let us know.
          </p>
          <Button
            onClick={() => setSubmitted(false)}
            style={{
              height: 44, background: 'var(--portal-primary)', color: '#FFFFFF', fontWeight: 600,
              borderRadius: 'var(--portal-button-radius)', paddingLeft: 24, paddingRight: 24,
            }}
          >
            Submit another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <MessageSquarePlus size={24} color="var(--portal-primary)" />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--portal-text-primary)', margin: 0 }}>
          Report an issue / suggestion
        </h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--portal-text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>
        Spotted something that needs fixing, or have an idea for the club? Tell us here — add photos if it helps.
      </p>

      {/* Category */}
      <div style={cardStyle}>
        <label style={labelStyle}>What kind of message is this?</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CATEGORY_OPTIONS.map((opt) => {
            const active = category === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCategory(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${active ? 'var(--portal-accent)' : 'var(--portal-card-border)'}`,
                  background: active ? 'rgba(42,157,143,0.06)' : 'transparent',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${active ? 'var(--portal-accent)' : 'var(--portal-text-muted)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--portal-accent)' }} />}
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--portal-text-primary)' }}>{opt.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--portal-text-muted)' }}>{opt.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Message */}
      <div style={cardStyle}>
        <label style={labelStyle} htmlFor="issue-message">Your message</label>
        <Textarea
          id="issue-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe the issue or share your suggestion…"
          rows={5}
          style={{ fontSize: 14, borderColor: 'var(--portal-card-border)', resize: 'vertical' }}
        />
      </div>

      {/* Photos */}
      <div style={cardStyle}>
        <label style={labelStyle}>Photos <span style={{ fontWeight: 400, color: 'var(--portal-text-muted)' }}>(optional)</span></label>

        {photos.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            {photos.map((photo) => (
              <div key={photo.id} style={{ position: 'relative' }}>
                <img
                  src={photo.previewUrl}
                  alt=""
                  style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--portal-card-border)', display: 'block' }}
                />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  aria-label="Remove photo"
                  style={{
                    position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%',
                    background: 'var(--portal-primary)', color: '#FFFFFF', border: '2px solid var(--portal-card-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {photos.length < MAX_PHOTOS && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10,
                border: '1.5px solid var(--portal-card-border)', background: 'transparent', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, color: 'var(--portal-text-primary)',
              }}
            >
              <Camera size={18} color="var(--portal-accent)" /> Take a photo
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10,
                border: '1.5px solid var(--portal-card-border)', background: 'transparent', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, color: 'var(--portal-text-primary)',
              }}
            >
              <ImagePlus size={18} color="var(--portal-accent)" /> Choose from gallery
            </button>
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '10px 0 0' }}>
          Up to {MAX_PHOTOS} photos, 10 MB each.
        </p>

        {/* Camera capture — opens the camera directly on mobile */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
        {/* Gallery — allows multiple selection */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitting || !message.trim()}
        style={{
          width: '100%', height: 48, background: 'var(--portal-primary)', color: '#FFFFFF', fontWeight: 600,
          fontSize: 15, borderRadius: 'var(--portal-button-radius)', opacity: submitting || !message.trim() ? 0.6 : 1,
        }}
      >
        {submitting ? (<><Loader2 size={18} className="animate-spin" style={{ marginRight: 8 }} /> Sending…</>) : 'Send to the committee'}
      </Button>
    </div>
  );
}
