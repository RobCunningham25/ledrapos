// TODO: Phase 7 — re-enable JWT verification when admin auth is implemented
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
    const { member_id, venue_id } = await req.json()

    if (!member_id || !venue_id) {
      return new Response(JSON.stringify({ error: 'member_id and venue_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

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
      return new Response(JSON.stringify({ error: 'Member has no email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (member.auth_user_id) {
      return new Response(JSON.stringify({ error: 'Member has already been invited' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
      member.email,
      { data: { member_id: member.id, venue_id: member.venue_id } }
    )

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: authError?.message || 'Failed to send invite' }), {
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
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
