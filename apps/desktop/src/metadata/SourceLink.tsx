import { useState } from 'react';
import { discogs } from './gateway';
import { errorMessage } from '../library/gateway';

export function SourceLink({ id }: { id: number }) {
  const [error, setError] = useState('');
  return <><a className="source-attribution" href={`https://www.discogs.com/release/${id}`} onClick={event => {
    event.preventDefault(); void discogs.openRelease(id).catch(cause => setError(errorMessage(cause)));
  }}>Data provided by Discogs.</a>{error && <p className="form-error" role="alert">{error}</p>}</>;
}
