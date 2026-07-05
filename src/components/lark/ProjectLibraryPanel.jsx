import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ProjectHistoryCard from '@/components/lark/ProjectHistoryCard';
import RawAudioLibraryCard from '@/components/lark/RawAudioLibraryCard';
import { listRawAudioEntries } from '@/lib/raw-audio-library';

const TABS = [
  { id: 'projects', label: 'Audiotool Projects' },
  { id: 'raw', label: 'Raw Audio' },
];

export default function ProjectLibraryPanel(props) {
  const { refreshKey, isAuthenticated, onLogin, onRefreshProjects } = props;
  const [activeTab, setActiveTab] = useState('projects');
  const [rawCount, setRawCount] = useState(0);

  useEffect(() => {
    setRawCount(listRawAudioEntries().length);
  }, [refreshKey]);

  return (
    <div
      className="lark-card-glass rounded-2xl p-5"
      style={{ minHeight: '180px' }}
    >
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(128,128,128,0.06)' }}>
          {TABS.map(({ id, label }) => {
            const active = activeTab === id;
            const count = id === 'raw' ? rawCount : null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
                style={{
                  background: active ? 'rgba(139,92,246,0.18)' : 'transparent',
                  color: active ? 'var(--lark-violet-bright)' : 'var(--lark-text-muted)',
                  border: active ? '1px solid rgba(139,92,246,0.35)' : '1px solid transparent',
                }}
              >
                {label}
                {count > 0 && (
                  <span
                    className="text-[9px] px-1 py-0.5 rounded-full font-mono"
                    style={{
                      background: 'rgba(139,92,246,0.15)',
                      color: 'rgba(139,92,246,0.85)',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === 'projects' && (
          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                onLogin?.();
                return;
              }
              onRefreshProjects?.();
            }}
            className="p-1.5 rounded-lg transition-all duration-200"
            style={{ color: 'var(--lark-text-muted)' }}
            title="Refresh projects"
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>

      {activeTab === 'projects' ? (
        <ProjectHistoryCard {...props} embedded />
      ) : (
        <RawAudioLibraryCard
          refreshKey={refreshKey}
          onLibraryChange={() => setRawCount(listRawAudioEntries().length)}
          onUseForHumming={props.onUseRawAudio}
          activeRawAudioId={props.activeRawAudioId}
        />
      )}
    </div>
  );
}
