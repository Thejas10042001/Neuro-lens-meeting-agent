
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PresentationChartLineIcon } from './icons/PresentationChartLineIcon';

// Mock Data for a past meeting
const generateMockSession = (id: number) => {
    const data = [];
    for (let i = 0; i < 20; i++) {
        data.push({
            time: i,
            attention: 60 + Math.random() * 30,
            stress: 20 + Math.random() * 30,
        });
    }
    return {
        id,
        date: new Date(Date.now() - id * 86400000).toLocaleDateString(),
        title: id === 0 ? "Weekly Sync with Dr. Avi" : id === 1 ? "Project Roadmap Review" : "Client Discovery Call",
        duration: "45 mins",
        avgAttention: Math.floor(70 + Math.random() * 20),
        data
    };
};

const sessions = [generateMockSession(0), generateMockSession(1), generateMockSession(2)];

const MeetingHistory: React.FC = () => {
    return (
        <div className="grid grid-cols-1 gap-6">
            {sessions.map((session) => (
                <div key={session.id} className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 hover:border-emerald-500/30 transition-all group">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 group-hover:border-emerald-500/50 group-hover:bg-emerald-900/10 transition-all">
                                <PresentationChartLineIcon className="w-6 h-6 text-gray-400 group-hover:text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">{session.title}</h3>
                                <p className="text-sm text-gray-400">{session.date} • {session.duration}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                             <div className="text-right">
                                <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Attention</p>
                                <p className="text-2xl font-bold text-emerald-400">{session.avgAttention}%</p>
                            </div>
                             <div className="text-right">
                                <p className="text-xs text-gray-500 uppercase tracking-wider">Status</p>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-900/30 text-emerald-400 border border-emerald-500/20">
                                    Processed
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="h-32 w-full bg-gray-900/50 rounded-lg border border-gray-800/50 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={session.data}>
                                <defs>
                                    <linearGradient id={`grad${session.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis dataKey="time" hide />
                                <YAxis hide domain={[0, 100]} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6', borderRadius: '0.5rem', fontSize: '12px' }}
                                    formatter={(val: number) => val.toFixed(1)}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="attention" 
                                    stroke="#10b981" 
                                    strokeWidth={2} 
                                    fill={`url(#grad${session.id})`} 
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            ))}
            
            <div className="text-center p-8 border-2 border-dashed border-gray-800 rounded-xl">
                <p className="text-gray-500">Install the <strong>NeuroLens Chrome Extension</strong> to automatically populate this history.</p>
                <button className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors">
                    Download Extension
                </button>
            </div>
        </div>
    );
};

export default MeetingHistory;
