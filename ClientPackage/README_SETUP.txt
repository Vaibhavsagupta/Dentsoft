=======================================================
          DENTAL LAB SYSTEM - DEPLOYMENT PACKAGE
=======================================================

FILES INCLUDED IN THIS FOLDER:
-------------------------------------------------------
1. server.exe             : Compiled Backend API server (No source code included).
2. cloudflared.exe        : Cloudflare Tunnel daemon for HTTPS domain routing.
3. cloudflare-config.yml  : Tunnel configuration mapping to localhost:5000.
4. credentials.json       : Cloudflare Tunnel authentication key (Place your generated key here).
5. start-silent.vbs       : Silent background runner (Runs server & tunnel with NO black windows).
6. start-visible.bat      : Testing/Debug runner with console window.
7. stop-server.bat        : Stops running server and tunnel instances.
8. update.bat             : 1-Click updater script to fetch new server.exe releases.


SETUP INSTRUCTIONS FOR CLIENT MACHINE:
-------------------------------------------------------
1. Copy this entire folder to the client machine:
   Recommended Path: C:\DentalLabApp\

2. Setup Cloudflare Tunnel (1-Time Setup):
   - Open Command Prompt in this folder and run:
       cloudflared.exe tunnel login
   - Create the tunnel:
       cloudflared.exe tunnel create lab-backend-tunnel
   - Route domain / subdomain:
       cloudflared.exe tunnel route dns lab-backend-tunnel sdl.sohardental.com
   - Copy the generated .json file into this folder and rename it to:
       credentials.json
   - Open cloudflare-config.yml and replace the tunnel UUID with your new tunnel UUID.

3. Enable Auto-Start on Windows Boot:
   - Press [Win + R] on keyboard.
   - Type: shell:startup  (Press Enter).
   - Right-click "start-silent.vbs" in C:\DentalLabApp\ and choose "Create shortcut".
   - Move/Paste that shortcut into the Startup folder.
   - Now whenever the PC turns ON, backend and tunnel will launch silently in background!

4. How to Update in Future:
   - Whenever a new version is released on GitHub, double-click "update.bat".
   - It will automatically download the new server.exe and restart the system.
