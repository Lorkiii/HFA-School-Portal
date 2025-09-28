
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://nnmcwfajwtzcqpuxyory.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ubWN3ZmFqd3R6Y3FwdXh5b3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5MTY5MDQsImV4cCI6MjA3MDQ5MjkwNH0.VugyitzDcOszzVKrHrVBTF5qdHiqsyoo93NfVL5pnWk';

export const supabase = createClient(supabaseUrl, supabaseKey)