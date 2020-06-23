// JavaScript Document
	
// Parameters to be customised depending upon the installation
	
var tokens = [["X-Plex-Product", "Plex monitor"], 
              ["X-Plex-Version", "1.0"],
              ["X-Plex-platform", "RaspberryPi"],
              ["X-Plex-platformVersion", "3B"],
              ["X-Plex-device", "touch"],
              ["X-Plex-model", "touch"]];	
	
var plexUrl = "http://plex-server-url:32400";

var codecs = {"audio": ["aac", "he-aac", "mp2", "mp3", "pcm"], "video": ["h264", "mpeg4", "hevc"]};             // limit to those video codecs supported by hardware decode
var max_video_resolution = {"width": 1920, "height": 1080};             // scaling the video takes lost of CPU, especially downscaling, unless hardware scaling used
	
var plex_username = "your-user-name";
var plex_password = "your-password";
