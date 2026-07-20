-- SQL script to automate landmark generation for the KSP Datathon project using Nominatim.
-- This script adds the landmark column to the casemaster table,
-- enables the HTTP extension, and sets up a BEFORE INSERT OR UPDATE trigger
-- to populate the landmark name via the Nominatim Reverse Geocoding API.

-- 1. Enable the HTTP extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- 2. Add the landmark column to the casemaster table
ALTER TABLE public.casemaster 
  ADD COLUMN IF NOT EXISTS landmark TEXT;

-- 3. Create the Trigger Function
CREATE OR REPLACE FUNCTION public.update_landmark_fn()
RETURNS TRIGGER AS $$
DECLARE
  api_url TEXT;
  user_agent TEXT;
  http_response RECORD;
  response_json JSONB;
  landmark_text TEXT;
BEGIN
  -- Check if latitude or longitude is null. If so, apply fallback.
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.landmark := 'No landmark located';
    RETURN NEW;
  END IF;

  -- 1. Retrieve the User-Agent identifying your application.
  -- Nominatim requires a valid User-Agent identifying your app.
  -- We first check Supabase Vault, then fall back to custom settings, then a default.
  BEGIN
    SELECT decrypted_secret INTO user_agent 
    FROM vault.decrypted_secrets 
    WHERE name = 'NOMINATIM_USER_AGENT' 
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    user_agent := NULL;
  END;

  IF user_agent IS NULL THEN
    BEGIN
      user_agent := current_setting('app.settings.nominatim_user_agent', true);
    EXCEPTION WHEN OTHERS THEN
      user_agent := NULL;
    END;
  END IF;

  -- Default fallback User-Agent if none is configured
  IF user_agent IS NULL OR user_agent = '' THEN
    user_agent := 'KSP-Datathon-Automation/1.0 (contact: supabase-trigger@example.com)';
  END IF;

  -- 2. Construct the Nominatim reverse geocoding API URL.
  -- We request jsonv2 format, addressdetails, and namedetails to get the most specific landmark names.
  api_url := 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' 
             || NEW.latitude || '&lon=' || NEW.longitude 
             || '&addressdetails=1&namedetails=1&zoom=18';

  -- 3. Make the synchronous HTTP GET request with the required User-Agent header.
  BEGIN
    SELECT * INTO http_response FROM extensions.http((
      'GET', 
      api_url, 
      ARRAY[extensions.http_header('User-Agent', user_agent)], 
      NULL, 
      NULL
    )::extensions.http_request);
    
    IF http_response.status = 200 THEN
      response_json := http_response.content::jsonb;
      
      -- Extract the most specific landmark/place name.
      -- A. Try to extract the formal name of the OSM object from namedetails.
      IF response_json ? 'namedetails' AND response_json -> 'namedetails' ? 'name' THEN
        landmark_text := response_json -> 'namedetails' ->> 'name';
      END IF;
      
      -- B. If no name in namedetails, check common POI tags in address details.
      IF landmark_text IS NULL OR landmark_text = '' THEN
        IF response_json ? 'address' THEN
          SELECT COALESCE(
            response_json -> 'address' ->> 'amenity',
            response_json -> 'address' ->> 'tourism',
            response_json -> 'address' ->> 'historic',
            response_json -> 'address' ->> 'attraction',
            response_json -> 'address' ->> 'building',
            response_json -> 'address' ->> 'shop',
            response_json -> 'address' ->> 'leisure',
            response_json -> 'address' ->> 'office'
          ) INTO landmark_text;
        END IF;
      END IF;
      
      -- C. Fall back to the full display_name (address string) if no POI name is found.
      IF landmark_text IS NULL OR landmark_text = '' THEN
        landmark_text := response_json ->> 'display_name';
      END IF;
    ELSE
      RAISE WARNING 'Nominatim API returned status code %', http_response.status;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to call Nominatim API: %', SQLERRM;
  END;

  -- 4. Apply fallback if no landmark was resolved
  IF landmark_text IS NULL OR landmark_text = '' THEN
    NEW.landmark := 'No landmark located';
  ELSE
    NEW.landmark := landmark_text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach the Trigger to the casemaster table
DROP TRIGGER IF EXISTS set_landmark_trigger ON public.casemaster;
CREATE TRIGGER set_landmark_trigger
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.casemaster
FOR EACH ROW
EXECUTE FUNCTION public.update_landmark_fn();
