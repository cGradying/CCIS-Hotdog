@echo off
REM Runs the Facebook token refresh for the bscs1nres announcement pipeline.
REM Scheduled every 20 days via Task Scheduler ("BSCS1NRES_FB_TOKEN_REFRESH").
REM Opens the browser for consent once, then updates .env with the fresh page token.
cd /d C:\Users\Richie\Projects\bscs1nres
node scripts\facebook-login.js 1102204788805535 >> output\fb-refresh.log 2>&1