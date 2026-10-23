// "Classic room": the original cosy back room (Room.tsx), kept as an option. Its own lazy chunk.
import { Room } from '../Room';
import type { SceneProps } from './base';
export default function Classic({ hi }: SceneProps) {
  return (<>
    <Room />
    {/* High: a soft back light from behind the far seats puts a rim on the characters */}
    {hi && <directionalLight position={[0.4, 1.0, -2.6]} intensity={0.75} color="#ffe9cf" />}
  </>);
}
