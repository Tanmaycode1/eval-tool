# Debugging UI Issues in Production

## Common Causes of UI Differences Between Local and Production

### 1. **Browser Caching (MOST COMMON)**
**Symptom:** UI works locally but shows old behavior in production
**Solution:** 
- Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Clear browser cache
- Open in incognito/private mode
- Check browser DevTools → Network tab → Disable cache

### 2. **Static Files Not Loading**
**Symptom:** Missing CSS/JS, broken styling, JavaScript errors
**Check:**
- Open browser DevTools → Console tab → Look for 404 errors
- Check Network tab → See if `/static/js/home.js` etc. return 404
- Verify static files path in logs (should see: `📁 Static files directory: ...`)

### 3. **Path Resolution Issues**
**Symptom:** Static files return 404 in Docker but work locally
**Solution:** The code now uses absolute path resolution - check logs on startup

### 4. **JavaScript Errors**
**Symptom:** UI behaves differently, buttons don't work
**Check:**
- Open browser DevTools → Console tab
- Look for red error messages
- Check if API calls are failing (Network tab)

### 5. **Environment Differences**
**Symptom:** Different behavior due to different data/config
**Check:**
- Database state (different data in production)
- Environment variables
- API endpoints returning different data

## Quick Debugging Steps

1. **Check Browser Console:**
   ```javascript
   // Open DevTools (F12) → Console tab
   // Look for errors
   ```

2. **Check Network Requests:**
   ```javascript
   // DevTools → Network tab
   // Filter by JS/CSS
   // Check if files load (status 200) or fail (404/500)
   ```

3. **Verify Static Files:**
   ```bash
   # In Docker container
   docker exec -it shram-eval-tool ls -la /app/app/templates/static/js/
   ```

4. **Check Server Logs:**
   ```bash
   # Look for static files directory message on startup
   docker logs shram-eval-tool | grep "Static files directory"
   ```

5. **Test Static File Access:**
   ```bash
   # From browser or curl
   curl http://your-server:8000/static/js/home.js
   # Should return JavaScript content, not 404
   ```

## Fixes Applied

1. ✅ **Improved path resolution** - Now uses absolute paths that work in Docker
2. ✅ **Added cache-busting headers** - Prevents browser from caching old JS/CSS
3. ✅ **Added debug logging** - Shows static files directory on startup

## If Issues Persist

1. **Rebuild Docker image:**
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

2. **Check file permissions:**
   ```bash
   docker exec -it shram-eval-tool ls -la /app/app/templates/static/
   ```

3. **Verify file structure in container:**
   ```bash
   docker exec -it shram-eval-tool find /app -name "home.js"
   ```

4. **Check if static files are being served:**
   - Visit: `http://your-server:8000/static/js/home.js`
   - Should see JavaScript code, not 404

