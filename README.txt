EcoScope update 3: email (password reset + invitations), chart pictures in any format, exports to Word/CSV/Excel/PowerPoint,
smarter help assistant, live support chat, live project chat

1. Supabase -> SQL Editor: run supabase_upgrade_3.sql (once).

2. Resend (for emails) -> Railway -> EcoScope service -> Variables, add:
     RESEND_API_KEY = re_...                      (resend.com -> API Keys)
     MAIL_FROM      = EcoScope <no-reply@YOUR-DOMAIN>   (a domain you verified in Resend -> Domains)
     APP_URL        = https://ecoscope-production-1be6.up.railway.app
   Without a verified domain, Resend only delivers to your own Resend login email.
   Without RESEND_API_KEY nothing breaks: invite links are shown on screen to copy, reset emails are skipped.

3. Copy everything in this zip into Documents\GBN-PERSONAL (replace; keep the folders, files under src\ go into src\...).

4. Test locally:
     cd C:\Users\gbruc\Documents\GBN-PERSONAL
     npm run build
     npm run local          -> http://localhost:3001

5. Push and deploy:
     git rm "src/App.js(2)"          (the old stray copy; skip if it says it does not exist)
     git add -A
     git status                      (.env must NOT be listed)
     git commit -m "Email, exports, snapshots, live chat, smarter assistant"
     git push
     railway up
