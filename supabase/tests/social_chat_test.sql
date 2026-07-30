begin;

select plan(22);

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'alice@example.test', '{}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'bob@example.test', '{}', '{}', now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'mallory@example.test', '{}', '{}', now(), now());

update public.profiles
set nickname = case id
      when '11111111-1111-4111-8111-111111111111' then 'Alice'
      when '22222222-2222-4222-8222-222222222222' then 'Bob'
      else 'Mallory'
    end,
    friend_code = case id
      when '11111111-1111-4111-8111-111111111111' then 'ALCDE234'
      when '22222222-2222-4222-8222-222222222222' then 'BQB23456'
      else 'MALLRY23'
    end;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select lives_ok(
  $$ select public.send_friend_request('BQB23456') $$,
  'Alice can send Bob a friend request'
);
select is(
  (select count(*) from public.send_friend_request('ZZZZZZZZ')),
  0::bigint,
  'An unknown friend code returns the same generic empty result'
);
reset role;
select is(
  (select count(*) from public.friend_lookup_attempts
    where user_id = '11111111-1111-4111-8111-111111111111'),
  2::bigint,
  'Successful and failed friend-code lookups both count toward rate limits'
);
set local role authenticated;
select is(
  (select count(*) from public.list_friend_requests()),
  1::bigint,
  'Alice sees her outgoing request'
);
select is(
  (select count(*) from public.profiles where nickname = 'Mallory'),
  0::bigint,
  'Alice cannot browse unrelated profiles'
);

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select is(
  (select direction from public.list_friend_requests() limit 1),
  'incoming',
  'Bob sees the incoming request'
);
select lives_ok(
  $$ select public.respond_friend_request(
    (select request_id from public.list_friend_requests() limit 1),
    true
  ) $$,
  'Bob can accept the request'
);
select is(
  (select count(*) from public.get_conversation_summaries()),
  1::bigint,
  'Accepting creates one direct conversation'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select lives_ok(
  $$ select public.send_message(
    (select conversation_id from public.get_conversation_summaries() limit 1),
    'hello Bob'
  ) $$,
  'Alice can message a current friend'
);

select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);
select is(
  (select count(*) from public.messages),
  0::bigint,
  'Mallory cannot read another conversation'
);
select lives_ok(
  $$ select public.block_user('11111111-1111-4111-8111-111111111111') $$,
  'Mallory can block a known user id without gaining profile access'
);
select is(
  (select count(*) from public.profiles
    where id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'Blocking an unrelated user does not expose their full profile'
);

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select is(
  (select unread_count from public.get_conversation_summaries() limit 1),
  1::bigint,
  'Bob sees one unread message'
);
select lives_ok(
  $$ select public.mark_conversation_seen(
    (select conversation_id from public.get_conversation_summaries() limit 1)
  ) $$,
  'Bob can mark the committed conversation watermark seen'
);
select is(
  (select unread_count from public.get_conversation_summaries() limit 1),
  0::bigint,
  'The unread count becomes zero'
);
select lives_ok(
  $$ select public.clear_conversation(
    (select conversation_id from public.get_conversation_summaries() limit 1)
  ) $$,
  'Bob can clear only his own history watermark'
);
select is(
  (select count(*) from public.messages),
  0::bigint,
  'Bob no longer sees messages below his clear watermark'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select is(
  (select count(*) from public.messages),
  1::bigint,
  'Alice still sees history cleared only by Bob'
);
select lives_ok(
  $$ select public.remove_friend('22222222-2222-4222-8222-222222222222') $$,
  'Alice can remove Bob while retaining history'
);
select throws_ok(
  $$ select public.send_message(
    (select conversation_id from public.get_conversation_summaries() limit 1),
    'should fail'
  ) $$,
  'P0001',
  '当前无法发送消息',
  'Removed friends cannot send new messages'
);
select lives_ok(
  $$ select public.block_user('22222222-2222-4222-8222-222222222222') $$,
  'Alice can block Bob'
);
select is(
  (select count(*) from public.list_blocked_users()),
  1::bigint,
  'Alice can list and later unblock users she blocked'
);

select * from finish();
rollback;
