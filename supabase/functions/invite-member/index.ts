import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify the caller is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check admin_users table
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id, venue_id')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!adminUser) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { member_id, venue_id } = await req.json()

    if (!member_id || !venue_id) {
      return new Response(JSON.stringify({ error: 'member_id and venue_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, email, auth_user_id, venue_id')
      .eq('id', member_id)
      .eq('venue_id', venue_id)
      .single()

    if (memberError || !member) {
      return new Response(JSON.stringify({ error: 'Member not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!member.email) {
      return new Response(JSON.stringify({ error: 'Member has no email address. Add an email before inviting.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (member.auth_user_id) {
      return new Response(JSON.stringify({ error: 'This member has already been invited to the portal.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if user already exists in auth.users
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    })

    // Search by email since listUsers doesn't support email filter directly
    let existingAuthUser = null
    if (!listError) {
      // Use a targeted approach: try to get user by email
      const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      if (usersData?.users) {
        existingAuthUser = usersData.users.find(
          (u: any) => u.email?.toLowerCase() === member.email!.toLowerCase()
        ) || null
      }
    }

    if (existingAuthUser) {
      // Link to existing auth user without sending invite
      const { error: updateError } = await supabase
        .from('members')
        .update({ auth_user_id: existingAuthUser.id })
        .eq('id', member_id)

      if (updateError) {
        return new Response(JSON.stringify({ error: 'Failed to link member to existing account' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        success: true,
        auth_user_id: existingAuthUser.id,
        message: 'Member linked to existing account. They can log in with their existing password.',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // No existing auth user — send invite
    const { data: authData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      member.email,
      { data: { member_id: member.id, venue_id: member.venue_id } }
    )

    if (inviteError || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Failed to send invite. Please try again.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: updateError } = await supabase
      .from('members')
      .update({ auth_user_id: authData.user.id })
      .eq('id', member_id)

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Invite sent but failed to link account' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, auth_user_id: authData.user.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to send invite. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
