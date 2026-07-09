import { usePortalTheme } from '@/contexts/PortalThemeContext';
import SetPasswordFromLink from '@/components/portal/SetPasswordFromLink';

export default function AcceptInvite() {
  const T = usePortalTheme();
  return (
    <SetPasswordFromLink
      heading={`Welcome to ${T.venueName}`}
      subtitle="Set a password to finish activating your portal account."
      submitLabel="Set password & enter portal"
      invalidTitle="Invite link invalid"
      invalidMessage="This invite link is invalid or has expired. Ask the club to resend your invite."
    />
  );
}
