import { PORTAL_THEME as T } from '@/constants/portalTheme';

const STEPS = ['Type', 'Dates', 'Details', 'Review'];

interface Props { current: number; }

export default function BookingStepIndicator({ current }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0, margin: '20px 0 28px' }}>
      {STEPS.map((label, i) => {
        const step = i + 1;
        const completed = step < current;
        const active = step === current;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: completed ? T.teal : active ? T.navy : T.cardBorder,
                color: completed || active ? '#FFFFFF' : T.textMuted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600,
              }}>{step}</div>
              <span style={{ fontSize: 11, marginTop: 4, color: active ? T.navy : completed ? T.teal : T.textMuted, fontWeight: active ? 600 : 400 }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 40, height: 2, background: completed ? T.teal : T.cardBorder, marginTop: -10, alignSelf: 'flex-start', marginLeft: -4, marginRight: -4, position: 'relative', top: 14 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
