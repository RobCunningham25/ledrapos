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

    // Verify the caller is a superadmin
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

    // Check caller is superadmin
    const { data: callerAdmin } = await supabase
      .from('admin_users')
      .select('id, venue_id, role')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!callerAdmin || callerAdmin.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Superadmin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, name, role, venue_id } = await req.json()

    if (!email || !name || !venue_id) {
      return new Response(JSON.stringify({ error: 'email, name, and venue_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Only allow creating 'admin' role via API
    if (role && role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admin role can be created through the UI' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if email already exists in admin_users for this venue
    const { data: existingAdmin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', email)
      .eq('venue_id', venue_id)
      .maybeSingle()

    if (existingAdmin) {
      return new Response(JSON.stringify({ error: 'An admin with this email already exists for this venue' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Insert admin_users row first
    const { data: newAdmin, error: insertError } = await supabase
      .from('admin_users')
      .insert({ venue_id, email, name, role: 'admin', is_active: true })
      .select('id')
      .single()

    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to create admin record: ' + insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send Supabase Auth invite
    const { data: authData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      { data: { role: 'admin', venue_id } }
    )

    if (inviteError) {
      // If user already exists in auth, return helpful error but keep admin_users row
      if (inviteError.message?.includes('already been registered') || inviteError.message?.includes('already exists')) {
        return new Response(JSON.stringify({ 
          error: 'This email is already registered. Please ask them to log in directly.',
          admin_id: newAdmin.id 
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: inviteError.message || 'Failed to send invite' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update admin_users with auth_user_id
    if (authData?.user) {
      await supabase
        .from('admin_users')
        .update({ auth_user_id: authData.user.id })
        .eq('id', newAdmin.id)
    }

    return new Response(JSON.stringify({ 
      success: true, 
      admin_id: newAdmin.id,
      auth_user_id: authData?.user?.id ?? null 
    }), {
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
