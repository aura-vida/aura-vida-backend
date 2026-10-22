import 'dotenv/config';
import { uploadBuffer, deleteObject } from '../src/services/s3.service.js';

try {
  const result = await uploadBuffer(Buffer.from('kusala s3 test'), 'test.jpg', 'spaces/test-space');
  console.log('Upload succeeded:', JSON.stringify(result, null, 2));

  const res = await fetch(result.url);
  console.log('Public URL fetch status:', res.status);
  const text = await res.text();
  console.log('Body:', text.slice(0, 500));

  await deleteObject(result.key);
  console.log('Cleanup delete: OK');
} catch (err) {
  console.log('FAILED');
  console.log('Error name:', err.name);
  console.log('Error message:', err.message);
}
