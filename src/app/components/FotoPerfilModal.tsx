import React, { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from './CustomIcons';
import { reduzirFoto } from '../reduzirFoto';

/**
 * Primeiro acesso: logo depois de confirmar o e-mail, pede a foto de perfil.
 * Aparece uma vez só; "Agora não" fecha, e dá pra colocar depois em Perfil → Editar.
 */
export const FotoPerfilModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { profile, setAvatar, showNotification } = useApp();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  if (!isOpen) return null;

  const escolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEnviando(true);
    try {
      if (await setAvatar(await reduzirFoto(arquivo))) onClose();
    } catch {
      showNotification('❌ Não deu pra ler essa imagem');
    }
    setEnviando(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="foto-perfil-titulo"
    >
      <div className="w-full max-w-md bg-[#130d2c] border border-purple-500/30 rounded-t-3xl sm:rounded-3xl p-6 text-center shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
        <button
          type="button"
          onClick={() => arquivoRef.current?.click()}
          disabled={enviando}
          className="relative mx-auto block rounded-full active:scale-95 transition-all disabled:opacity-60"
          aria-label="Escolher foto de perfil"
        >
          <Avatar url={profile.avatarUrl} size={96} alt={profile.name} />
          <span className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-purple-600 border-2 border-[#130d2c] flex items-center justify-center text-white">
            <Camera className="w-4 h-4" />
          </span>
        </button>

        <h3 id="foto-perfil-titulo" className="text-xl font-black text-white mt-4">Coloque sua foto</h3>
        <p className="text-sm text-gray-400 mt-1.5">
          É ela que seus adversários veem na mesa, em todos os jogos.
        </p>

        <input ref={arquivoRef} type="file" accept="image/*" onChange={escolher} className="hidden" />

        <button
          type="button"
          onClick={() => arquivoRef.current?.click()}
          disabled={enviando}
          className="w-full mt-5 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-extrabold text-base shadow-[0_4px_20px_rgba(168,85,247,0.4)] active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {enviando ? 'Enviando foto…' : 'Escolher foto'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={enviando}
          className="w-full mt-2 py-3 rounded-2xl text-gray-400 font-bold text-sm"
        >
          Agora não
        </button>
        <p className="text-[11px] text-gray-500 mt-1">Dá pra trocar depois tocando na sua foto no menu.</p>
      </div>
    </div>
  );
};
