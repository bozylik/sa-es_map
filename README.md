# SA-ES Map Application

GTA San Andreas Events Map Application

## Description
This is a web application for displaying events on a map of GTA San Andreas. Users can create events, draw lines between points, and view them on the map. Administrators can approve or reject events through an admin panel.

## Features
- Interactive map of GTA San Andreas
- Create point events by clicking on the map
- Draw line events between two points
- Admin panel for event approval
- Event queue system
- Responsive design

## Deployment
This application is configured for deployment on Railway.

### Environment Variables
- `PORT` - Port for the server to listen on (default: 3000)

### Admin Access
The default admin code is `1234`.

## Local Development
1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```

3. Visit `http://localhost:3000` in your browser

## File Structure
- `server.js` - Main server file
- `main.js` - Client-side JavaScript
- `db.js` - Database handling
- `events.json` - Approved events database
- `queue.json` - Pending events queue
- `gta_sa.png` - Map image
- `icons/` - Icon files