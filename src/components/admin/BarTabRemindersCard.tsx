import { useVenue } from "@/contexts/VenueContext";
import { useSendTabReminders } from "@/hooks/useSendTabReminders";
import { toast } from "sonner";

export default function BarTabRemindersCard() {
  const { venueId } = useVenue();
  const { sendReminders, loading, result, reset } = useSendTabReminders();

  const handleSend = async () => {
    try {
      await sendReminders(venueId);
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    }
  };

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 8,
        padding: 24,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1A202C", margin: 0 }}>
            Bar Tab Reminders
          </h3>
          <p style={{ fontSize: 13, color: "#718096", marginTop: 4, margin: 0 }}>
            Send email reminders to all members with an open tab.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={loading}
          style={{
            background: "#2E5FA3",
            color: "white",
            fontSize: 14,
            fontWeight: 500,
            height: 40,
            padding: "0 20px",
            borderRadius: 8,
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.background = "#1e4a8a";
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.background = "#2E5FA3";
          }}
        >
          {loading ? (
            <>
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: "2px solid white",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Sending...
            </>
          ) : (
            "Send Reminders"
          )}
        </button>
      </div>

      {result && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {result.sent > 0 && (
            <span
              style={{
                background: "#D1FAE5",
                color: "#065F46",
                border: "1px solid #A7F3D0",
                borderRadius: 99,
                padding: "4px 12px",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              ✓ {result.sent} reminder{result.sent === 1 ? "" : "s"} sent
            </span>
          )}
          {result.skipped > 0 && (
            <span style={{ color: "#718096", fontSize: 13 }}>
              {result.skipped} skipped (no email on file)
            </span>
          )}
          {result.errors.length > 0 && (
            <span
              style={{
                background: "#FEF3C7",
                color: "#92400E",
                border: "1px solid #FDE68A",
                borderRadius: 99,
                padding: "4px 12px",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {result.errors.length} failed
            </span>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              background: "none",
              color: "#2E5FA3",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              border: "none",
              padding: 0,
              marginLeft: "auto",
            }}
          >
            Send Again
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
