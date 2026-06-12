import http from 'http';
import https from 'https';

const req = https.request({
  hostname: 'srs-app-829739548529.europe-west1.run.app',
  port: 443,
  path: '/api/quiz',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW'
  }
}, res => {
  res.on('data', d => process.stdout.write(d));
});
req.write('------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name="subjectMain"\r\n\r\nTest\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name="content"\r\n\r\nTest\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n');
req.end();
