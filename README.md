# Whats-playing-on-Plex-server
Web client for a Plex Media Server (PMS) which displays currently playing music track, else displays a slide show. It can also play some radio stations.

## Summary
This web client is designed to display on a 480x320 pixel panel in full screen mode and is compatible with both Chrome and Midori (it was initially written for a Raspberry Pi with an attached touch screen panel and Chrome running in kiosk mode). It monitors the activity on a local Plex Media Server. When music is being played, it shows details about the track and what client device is playing it. If no music is being played, the web client starts a slide show of the photos and videos stored on the PMS. Alternatively, the user can play from a selection of radio stations.

## Features
* Monitors the Plex Media Server for any music being streamed by client devices.
* Displays a list of active client devices that are streaming music.
* Displays information about the track being streamed by one of the client devices.
* Scrapes a list of all the photos and videos stored on the PMS, checking for updates at regular intervals.
* If there are no active client devices, starts a slide show of all the photos and videos stored on the PMS.
* Photos and videos are selected at random from the scraped list. A photo is displayed for 20s while for videos a random 60s portion is played.
* Can play a selection of radio stations.
* From the status or slideshow screen, swiping up displays the radio stations. Clicking on a radio station starts playing it.
* From the radio stations screen, swiping down moves back to the status or slideshow screen.
* On the status screen, swiping left/right moves the remote client device to the next/previous track. Clicking on a tab displays the status for that client device.

## Installation
The web client uses the Balonku font, which may be downloaded from https://www.fontspace.com/azkarizki/balonku and copied to the fonts folder. The file js/custom-example.js has to be renamed to js/custom.js and customised with the URL of the PMS and the appropriate user credentials.
Note that the web client uses a web worker to scrape the list of photos. This means that the client cannot be loaded locally as a file and must be accessed via a web server.
Radio stations are played using the embedded radio player provided by UKRadioLive (see https://ukradiolive.com/embed-radio). If you want to change the list of radio stations, copy the code from UKRadioLive (make sure the "Radio starts automatically" tick-box is ticked) and create a new html file (use an existing one as a template). Then modify the array radio_stations in plex.js. 

## More information
The following websites were very helpful in determining how to access the PMS: https://github.com/Arcanemagus/plex-api/wiki/Plex-Web-API-Overview and https://github.com/plexinc/plex-media-player/wiki/Remote-control-API. 
Videos are only played if they are less than 50Mbytes and are in a format that can be decoded by the client device.
