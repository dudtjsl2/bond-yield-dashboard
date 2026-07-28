-- Fallback for corporate mail security gateways that rewrite/block the
-- confirm/unsubscribe links (e.g. Safe Links). A short numeric code lets a
-- subscriber confirm or unsubscribe by typing it into the site instead of
-- clicking a link.
alter table email_subscribers add column if not exists short_code text;
