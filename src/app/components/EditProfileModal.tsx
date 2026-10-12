import React, { useEffect, useRef, useState } from 'react';
import { X, UserCheck, ShieldCheck, Camera } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from './CustomIcons';
import { reduzirFoto } from '../reduzirFoto';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose }) => {
  const { profile, updateProfile, setAvatar, showNotification } = useApp();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [salvando, setSalvando] = useState(false);

  // O modal fica montado o tempo todo, então o useState pega o perfil de antes
  // do login. Recarrega os campos toda vez que abre.
  useEffect(() => {
    if (!isOpen) return;
    setName(profile.name);
    setUsername(profile.username);
  }, [isOpen, profile.name, profile.username]);

  if (!isOpen) return null;

  // A foto salva na hora, separada do nome: não depende do "Salvar".
  const escolherFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';                 // escolher a mesma foto de novo dispara outra vez
    if (!arquivo) return;
    setEnviando(true);
    try {
      await setAvatar(await reduzirFoto(arquivo));
    } catch {
      showNotification('❌ Não deu pra ler essa imagem');
    }
    setEnviando(false);
  };

  // Só fecha se o servidor aceitou: o @ é único e pode voltar recusado.
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    const ok = await updateProfile(name, username);
    setSalvando(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#130d2c] border border-purple-500/30 rounded-t-3xl sm:rounded-3xl p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-purple-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Editar Perfil</h3>
              <p className="text-xs text-gray-400">Personalize seus dados de jogador</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="flex flex-col items-center justify-center py-2">
            <button
              type="button"
              onClick={() => arquivoRef.current?.click()}
              disabled={enviando}
              className="relative rounded-full active:scale-95 transition-all disabled:opacity-60"
              aria-label="Trocar foto de perfil"
            >
              <Avatar url={profile.avatarUrl} size={80} alt={profile.name} />
              <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-purple-600 border-2 border-[#130d2c] flex items-center justify-center text-white">
                <Camera className="w-4 h-4" />
              </span>
            </button>
            <input ref={arquivoRef} type="file" accept="image/*" onChange={escolherFoto} className="hidden" />
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-purple-400 font-semibold">
                {enviando ? 'Enviando foto…' : 'Toque na foto pra trocar'}
              </span>
              {profile.avatarUrl && !enviando && (
                <button type="button" onClick={() => setAvatar(null)} className="text-xs text-gray-400 font-semibold underline">
                  Remover
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-1.5">
              Nome de Exibição:
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#181138] border border-purple-500/30 rounded-2xl py-3 px-4 text-white font-semibold focus:outline-none focus:border-purple-400"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-1.5">
              Nome de Usuário (@):
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#181138] border border-purple-500/30 rounded-2xl py-3 px-4 text-white font-semibold focus:outline-none focus:border-purple-400"
              required
            />
            <p className="text-[11px] text-gray-400 mt-1.5">
              Só letras, números, ponto e underline. Dois jogadores não podem ter o mesmo @.
            </p>
          </div>

          <div className="flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="text-xs text-purple-200">Selo de Conta Verificada ativo</span>
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-extrabold text-base shadow-[0_4px_20px_rgba(168,85,247,0.4)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60 disabled:active:scale-100"
          >
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </form>
      </div>
    </div>
  );
};
