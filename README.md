# Whats-playing-on-Plex-server
Web client for a Plex Media Server (PMS) which displays currently playing music track, else displays a slide show

## Summary
This web client is designed to display on a 480x320 pixel panel in full screen mode (it was written for a Raspberry Pi with an attached touch screen panel and Chrome running in kiosk mode). It monitors the activity on a local Plex Media Server. When music is being played, it shows details about the track and what client device is playing it. If no music is being played, the web client starts a slide show of the photos and videos stored on the PMS.

## Features
* Monitors the Plex Media Server for any music being streamed by client devices.
* Displays a list of active client devices that are streaming music.
* Displays information about the track being streamed by one of the client devices.
* Scrapes a list of all the photos and videos stored on the PMS, checking for updates at regular intervals.
* If there are no active client devices, starts a slide show of all the photos and videos stored on the PMS.
* Photos and videos are selected at random from the scraped list. A photo is displayed for 20s while for videos a random 60s portion is played.

## Installation
The web client uses the Balonku font, which may be downloaded from https://www.fontspace.com/azkarizki/balonku and copied to the fonts folder.

## More information
The following website was very helpful in determining how to access the PMS: https://github.com/Arcanemagus/plex-api/wiki/Plex-Web-API-Overview. Working out the parameters for the video transcoding were a bit hit & miss but seem to work ok. 