// The cosy back room behind the table (§14.3): walnut walls, an evening window, a shelf with tea glasses and
// pumpkins, crossed badminton rackets and shuttlecocks on the wall, a swaying brass lantern, a sleeping cat.
import { memo } from 'react';
import { Pumpkin, Racket, Shuttlecock, TeaGlass, FlagFrance, FlagPalestine, FlagSweden } from './characters';

export const BackRoom = memo(function BackRoom({ dim = false }: { dim?: boolean }) {
  return (
    <div className={`backroom ${dim ? 'dim' : ''}`} aria-hidden>
      <div className="wall" />
      <div className="wainscot" />
      <div className="window">
        <div className="window-sky" />
        <div className="window-bars" />
        <div className="window-sill"><Pumpkin w={34} /><Pumpkin w={22} hue={-8} /></div>
      </div>
      <div className="shelf shelf-a">
        <div className="shelf-items"><TeaGlass w={14} /><TeaGlass w={14} /><span className="dallah" /><Pumpkin w={30} /><TeaGlass w={14} /></div>
        <div className="shelf-board" />
      </div>
      <div className="shelf shelf-b">
        <div className="shelf-items"><Pumpkin w={26} hue={6} /><span className="jar" /><Shuttlecock w={12} /><Shuttlecock w={12} /></div>
        <div className="shelf-board" />
      </div>
      <div className="rackets"><Racket w={22} rot={-24} /><Racket w={22} rot={24} /><Shuttlecock w={14} className="wall-shuttle" /></div>
      <div className="wall-flags"><FlagFrance w={26} /><FlagPalestine w={30} /><FlagSweden w={26} /></div>
      <div className="lantern-wrap"><div className="lantern-chain" /><div className="lantern"><div className="lantern-glow" /></div></div>
      <div className="room-light" />
      <div className="rug" />
      <div className="cat"><span className="cat-body" /><span className="cat-head" /><span className="cat-ear e1" /><span className="cat-ear e2" /><span className="cat-tail" /></div>
      <div className="vignette" />
    </div>
  );
});
