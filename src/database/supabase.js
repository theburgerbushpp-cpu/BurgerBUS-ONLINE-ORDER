import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export function isSupabaseEnabled() {
  return Boolean(supabase);
}

function assertConfigured() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
}

export async function loadPersistedOrderingSnapshot() {
  assertConfigured();

  const [ordersResult, rewardsResult] = await Promise.all([
    supabase
      .from('orders')
      .select('order_payload')
      .order('created_at', { ascending: true }),
    supabase
      .from('rewards_ledger')
      .select('member_id, points')
      .order('member_id', { ascending: true }),
  ]);

  if (ordersResult.error) {
    throw new Error(`Supabase orders query failed: ${ordersResult.error.message}`);
  }

  if (rewardsResult.error) {
    throw new Error(`Supabase rewards query failed: ${rewardsResult.error.message}`);
  }

  return {
    orders: (ordersResult.data ?? []).map((row) => row.order_payload).filter(Boolean),
    rewardsMembers: (rewardsResult.data ?? []).map((row) => ({
      memberId: row.member_id,
      points: row.points,
    })),
  };
}

export async function persistOrder(order, rewardsMemberId) {
  assertConfigured();

  const now = new Date().toISOString();
  const orderResult = await supabase.from('orders').insert({
    order_id: order.orderId,
    clover_order_id: order.cloverOrderId,
    subtotal: order.subtotal,
    rewards_points_earned: order.rewardsPointsEarned,
    order_payload: order,
  });

  if (orderResult.error) {
    throw new Error(`Supabase order write failed: ${orderResult.error.message}`);
  }

  if (!rewardsMemberId) {
    return;
  }

  const existingResult = await supabase
    .from('rewards_ledger')
    .select('points')
    .eq('member_id', rewardsMemberId)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(`Supabase rewards lookup failed: ${existingResult.error.message}`);
  }

  const rewardsResult = await supabase.from('rewards_ledger').upsert(
    {
      member_id: rewardsMemberId,
      points: (existingResult.data?.points ?? 0) + order.rewardsPointsEarned,
      updated_at: now,
    },
    { onConflict: 'member_id' }
  );

  if (rewardsResult.error) {
    throw new Error(`Supabase rewards write failed: ${rewardsResult.error.message}`);
  }
}
