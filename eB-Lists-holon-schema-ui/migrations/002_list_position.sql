alter table public.lists
  add column if not exists position integer not null default 0;

with ranked as (
  select id,
         row_number() over (partition by owner_id, parent_list_id order by created_at, id) - 1 as new_position
  from public.lists
)
update public.lists l
set position = r.new_position
from ranked r
where l.id = r.id;
