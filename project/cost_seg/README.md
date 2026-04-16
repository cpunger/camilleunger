# PhotoSeg Cost Segregation Analyzer

## Setup Instructions

### Installation Steps
1. Clone the repository:
   ```
   git clone https://github.com/cpunger/camilleunger.git
   ```
2. Navigate to the project directory:
   ```
   cd camilleunger
   ```
3. Install required dependencies:
   ```
   npm install
   ```

### Environment Variables
- `DATABASE_URL`: URL to the database instance.
- `API_KEY`: API key for authentication.

### How to Mount the Component
Make sure your application is configured to mount the PhotoSeg component correctly:
```javascript
import PhotoSeg from './path/to/PhotoSeg';

function App() {
    return <PhotoSeg />;
}
```

### Backend Proxy Setup
Configure a proxy in your `package.json`: 
```json
"proxy": "http://localhost:5000"
```

Make sure to start your backend server before running the front end.