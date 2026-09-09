-- Usernames are stored lowercase as user_handle and must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS device_credentials_user_handle_unique
  ON device_credentials (user_handle);
