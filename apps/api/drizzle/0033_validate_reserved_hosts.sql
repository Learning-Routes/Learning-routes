-- 0032 added the check NOT VALID; this validates it, apart, so no write waits on the scan.
alter table spaces validate constraint spaces_slug_not_reserved;
