# SinBin Project Overview

## Project Purpose
SinBin is a real-time Twitch streaming overlay application that detects curse words during live streams and adds them to a visual "swear jar" with sound effects. The project gamifies language monitoring for streamers.

## Core Features
- Real-time speech recognition using Google Cloud Speech-to-Text API
- Visual swear jar overlay that fills up as curse words are detected
- Pleasant coin sound effects with volume control
- Live counter with smooth animations
- Customizable curse words list (predefined + custom additions)
- OBS Browser Source compatibility
- Web-based control panel for management
- Persistent counting between streams
- Auto-restart system for continuous listening

## Target Users
- Twitch streamers who want to gamify their language monitoring
- Content creators looking to add interactive overlays to their streams
- Streamers who want to track and visualize their profanity usage

## Architecture Overview
The application consists of:
- Node.js/Express backend server with Socket.IO for real-time communication
- Google Cloud Speech-to-Text integration for audio processing
- Two HTML frontend interfaces: overlay for OBS and control panel for management
- JSON configuration file for storing curse words and counts
- Audio recording system using node-record-lpcm16

## Project Structure
- `src/server.ts` - Main server application with SwearJarService class
- `public/overlay.html` - OBS browser source overlay interface
- `public/control.html` - Web-based control panel
- `swear-jar-config.json` - Configuration file for curse words and counts
- `google-credentials.json` - Google Cloud service account credentials
- `src/types/` - TypeScript type definitions