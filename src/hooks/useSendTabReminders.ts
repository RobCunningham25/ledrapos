import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ReminderResult {
  sent: number;
  skipped: number;
  errors: string[];
}

export const useSendTabReminders = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReminderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendReminders = async (venueId: string): Promise<ReminderResult> => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("send-tab-reminders", {
        body: { venue_id: venueId },
      });
      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error ?? "Failed to send reminders");
      setResult(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { sendReminders, loading, result, error, reset };
};
