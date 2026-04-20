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

    const { data: caller } = await supabase
      .from('admin_users')
      .select('id, venue_id, email, role')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!caller) {
      return json(403, { error: 'Admin access required' })
    }

    if (caller.role !== 'superadmin') {
      return json(403, { error: 'Only superadmins can grant or revoke admin access' })
    }

    const { member_id, venue_id, grant, role } = await req.json()

    if (!member_id || !venue_id || typeof grant !== 'boolean') {
      return json(400, { error: 'member_id, venue_id, and grant are required' })
    }

    if (grant && role !== 'admin' && role !== 'superadmin') {
      return json(400, { error: "role must be 'admin' or 'superadmin' when granting" })
    }

    if (caller.venue_id !== venue_id) {
      return json(403, { error: 'Cross-venue action not allowed' })
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, email, first_name, last_name, auth_user_id, venue_id')
      .eq('id', member_id)
      .eq('venue_id', venue_id)
      .single()

    if (memberError || !member) {
      return json(404, { error: 'Member not found' })
    }

    if (!member.email) {
      return json(400, { error: 'Member has no email address. Add an email before granting admin access.' })
    }

    const memberEmail = member.email.toLowerCase()

    if (memberEmail === caller.email.toLowerCase()) {
      return json(400, { error: 'You cannot change your own admin access.' })
    }

    const { data: existing } = await supabase
      .from('admin_users')
      .select('id, role, is_active')
      .eq('venue_id', venue_id)
      .ilike('email', memberEmail)
      .maybeSingle()

    if (grant) {
      if (existing) {
        const { error: updateError } = await supabase
          .from('admin_users')
          .update({
            is_active: true,
            role,
            auth_user_id: member.auth_user_id ?? null,
          })
          .eq('id', existing.id)

        if (updateError) {
          return json(500, { error: `Failed to update admin access: ${updateError.message}` })
        }

        return json(200, { success: true, action: 'updated', role })
      }

      const { error: insertError } = await supabase
        .from('admin_users')
        .insert({
          venue_id,
          email: memberEmail,
          name: `${member.first_name} ${member.last_name}`.trim(),
          role,
          is_active: true,
          auth_user_id: member.auth_user_id ?? null,
        })

      if (insertError) {
        return json(500, { error: `Failed to grant admin access: ${insertError.message}` })
      }

      return json(200, { success: true, action: 'granted', role })
    }

    if (!existing) {
      return json(200, { success: true, action: 'noop' })
    }

    const { error: revokeError } = await supabase
      .from('admin_users')
      .update({ is_active: false })
      .eq('id', existing.id)

    if (revokeError) {
      return json(500, { error: `Failed to revoke admin access: ${revokeError.message}` })
    }

    return json(200, { success: true, action: 'revoked' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json(500, { error: `set-member-admin crashed: ${message}` })
  }
})
