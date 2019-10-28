// JavaScript Document

// Parameters to be customised depending upon the installation
// In particular the client ID and the token need to be configured. The best way is to snoop on the values used by the Plex web app.

var tokens = {"X-Plex-Product": "Plex Web",
              "X-Plex-Version": "3.39.5",
              "X-Plex-Client-Identifier": "c8pxj5xa6depof2q07acxjfpz",
              "X-Plex-Platform": "Chrome",
              "X-Plex-Platform-Version": "73.0",
              "X-Plex-Sync-Version": "2",
              "X-Plex-Device": "Windows",
              "X-Plex-Device-Name": "Chrome",
              "X-Plex-Device-Screen-Resolution": "1117x678,1920x1080",
              "X-Plex-Token": "xyz",
              "X-Plex-Provider-Version": "1.1"};

var plexUrl = "http://<name or ip address of PMS>:32400";
