import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json(401, { error: 'Unauthorized' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return json(401, { error: 'Unauthorized' })
    }

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id, venue_id')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!adminUser) {
      return json(403, { error: 'Admin access required' })
    }

    const { member_id, venue_id, resend } = await req.json()

    if (!member_id || !venue_id) {
      return json(400, { error: 'member_id and venue_id are required' })
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, email, auth_user_id, venue_id')
      .eq('id', member_id)
      .eq('venue_id', venue_id)
      .single()

    if (memberError || !member) {
      return json(404, { error: 'Member not found' })
    }

    if (!member.email) {
      return json(400, { error: 'Member has no email address. Add an email before inviting.' })
    }

    // Find any existing auth user for this email (handles both the linked case
    // and the rare case where the user was created without being linked).
    const email = member.email.toLowerCase()
    let existingAuthUser: { id: string; email?: string; email_confirmed_at?: string | null; last_sign_in_at?: string | null } | null = null

    if (member.auth_user_id) {
      const { data: byId } = await supabase.auth.admin.getUserById(member.auth_user_id)
      if (byId?.user) existingAuthUser = byId.user as typeof existingAuthUser
    }

    if (!existingAuthUser) {
      const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      if (usersData?.users) {
        existingAuthUser = (usersData.users.find(
          (u) => u.email?.toLowerCase() === email
        ) as typeof existingAuthUser) || null
      }
    }

    const userHasSignedIn = !!existingAuthUser?.last_sign_in_at

    // New-invite path: member has no auth_user_id and no existing auth user with this email.
    if (!resend && !existingAuthUser) {
      const { data: authData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        member.email,
        { data: { member_id: member.id, venue_id: member.venue_id } }
      )

      if (inviteError || !authData?.user) {
        return json(500, {
          error: inviteError?.message
            ? `Supabase Auth error: ${inviteError.message}`
            : 'Failed to send invite (unknown auth error).',
        })
      }

      const { error: updateError } = await supabase
        .from('members')
        .update({ auth_user_id: authData.user.id })
        .eq('id', member_id)

      if (updateError) {
        return json(500, { error: `Invite sent but failed to link account: ${updateError.message}` })
      }

      return json(200, { success: true, auth_user_id: authData.user.id, action: 'invited' })
    }

    // Link-existing path: email is already in auth.users but the member row isn't linked,
    // AND caller didn't ask for a resend. Link silently (no email sent).
    if (!resend && existingAuthUser && !member.auth_user_id) {
      const { error: updateError } = await supabase
        .from('members')
        .update({ auth_user_id: existingAuthUser.id })
        .eq('id', member_id)

      if (updateError) {
        return json(500, { error: `Failed to link member to existing account: ${updateError.message}` })
      }

      return json(200, {
        success: true,
        auth_user_id: existingAuthUser.id,
        action: 'linked',
        message: 'Member linked to existing account. They can log in with their existing password.',
      })
    }

    // Already linked, caller didn't ask for resend.
    if (!resend && existingAuthUser && member.auth_user_id) {
      return json(409, { error: 'This member has already been invited. Use Resend to send the invite email again.' })
    }

    // Resend path.
    if (resend) {
      if (!existingAuthUser) {
        // Nothing to resend to — fall through to a fresh invite.
        const { data: authData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
          member.email,
          { data: { member_id: member.id, venue_id: member.venue_id } }
        )
        if (inviteError || !authData?.user) {
          return json(500, {
            error: inviteError?.message
              ? `Supabase Auth error: ${inviteError.message}`
              : 'Failed to send invite.',
          })
        }
        await supabase
          .from('members')
          .update({ auth_user_id: authData.user.id })
          .eq('id', member_id)

        return json(200, { success: true, auth_user_id: authData.user.id, action: 'invited' })
      }

      if (userHasSignedIn) {
        return json(409, {
          error: 'This member has already signed in to the portal. Send them a password reset link instead.',
        })
      }

      // Delete the unconfirmed auth user and re-invite fresh. This regenerates the invite
      // token and triggers a fresh invite email through Supabase Auth.
      const { error: delError } = await supabase.auth.admin.deleteUser(existingAuthUser.id)
      if (delError) {
        return json(500, { error: `Failed to reset prior invite: ${delError.message}` })
      }

      const { data: authData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        member.email,
        { data: { member_id: member.id, venue_id: member.venue_id } }
      )

      if (inviteError || !authData?.user) {
        // The old user was deleted; clear the stale link so Invite works again.
        await supabase.from('members').update({ auth_user_id: null }).eq('id', member_id)
        return json(500, {
          error: inviteError?.message
            ? `Supabase Auth error: ${inviteError.message}`
            : 'Failed to resend invite.',
        })
      }

      const { error: updateError } = await supabase
        .from('members')
        .update({ auth_user_id: authData.user.id })
        .eq('id', member_id)

      if (updateError) {
        return json(500, { error: `Invite resent but failed to relink account: ${updateError.message}` })
      }

      return json(200, { success: true, auth_user_id: authData.user.id, action: 'resent' })
    }

    // Should be unreachable.
    return json(500, { error: 'Unhandled invite state.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json(500, { error: `Invite function crashed: ${message}` })
  }
})
