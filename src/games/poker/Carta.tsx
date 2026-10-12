import React from 'react';
import { motion } from 'framer-motion';
import verso from '../../assets/poker/verso.webp';

const NAIPE: Record<string, [string, boolean]> = { s: ['♠', false], h: ['♥', true], d: ['♦', true], c: ['♣', false] };
const VALOR: Record<string, string> = { T: '10' };

type Props = {
  carta: string | null; className?: string; destaque?: boolean; apagada?: boolean; atraso?: number;
  // Buraco: carta clicável (seleção na mão), layoutId pra voar entre mão/jogo/lixo, e de onde ela nasce.
  onClick?: () => void; layoutId?: string; de?: { x: number | string; y: number | string };
};

/**
 * Carta desenhada (o kit só traz meia dúzia de faces) com o verso do kit.
 * `carta` null = fechada. O flip é rotateY: a frente nasce de costas.
 */
export const Carta: React.FC<Props> = ({
  carta, className = '', destaque, apagada, atraso = 0, onClick, layoutId, de,
}) => {
  const [simbolo, vermelha] = carta ? NAIPE[carta[1]] : ['', false];
  const valor = carta ? VALOR[carta[0]] ?? carta[0] : '';
  return (
    <motion.div
      className={`pk-carta ${className} ${destaque ? 'destaque' : ''} ${apagada ? 'apagada' : ''}`}
      onClick={onClick} layoutId={layoutId}
      initial={de ? { rotateY: 180, opacity: 0, x: de.x, y: de.y } : { rotateY: 180, opacity: 0, y: -30 }}
      animate={{ rotateY: carta ? 0 : 180, opacity: 1, x: 0, y: destaque ? -10 : 0 }}
      transition={{ duration: 0.45, delay: atraso, ease: 'easeOut' }}
    >
      <div className={`frente ${vermelha ? 'vermelha' : ''}`}>
        <span className="canto">{valor}<br />{simbolo}</span>
        <span className="naipe">{simbolo}</span>
      </div>
      <img className="verso" src={verso} alt="" draggable={false} />
    </motion.div>
  );
};
