import SetPasswordFromLink from '@/components/portal/SetPasswordFromLink';

export default function PortalResetPassword() {
  return (
    <SetPasswordFromLink
      heading="Reset your password"
      subtitle="Choose a new password for your portal account."
      submitLabel="Save new password"
      invalidTitle="Reset link invalid"
      invalidMessage="This password reset link is invalid or has expired. Request a new one from the login page."
    />
  );
}
