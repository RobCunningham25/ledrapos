import { useSearchParams } from "react-router-dom";

export default function Unsubscribed() {
  const [params] = useSearchParams();
  const status = params.get("status") || "invalid";
  const venueName = params.get("venue") || "the club";

  let heading = "Unsubscribed";
  let body =
    "If you had a valid unsubscribe link, you've been removed from the mailing list. You can close this window now.";

  if (status === "updated") {
    heading = "You're unsubscribed";
    body = `You won't receive any more broadcast emails from ${venueName}. If this was a mistake, contact the club directly to be added back.`;
  } else if (status === "already") {
    heading = "You're already unsubscribed";
    body = `You're not on the broadcast list for ${venueName}. No further action needed.`;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] px-5 py-12">
      <div className="w-full max-w-[520px]">
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-8 shadow-sm">
          <h1 className="mb-4 text-[22px] font-bold leading-tight text-[#1B3A4B]">
            {heading}
          </h1>
          <p className="m-0 text-[15px] leading-relaxed text-slate-700">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
