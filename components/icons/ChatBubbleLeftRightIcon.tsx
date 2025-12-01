
import React from 'react';

export const ChatBubbleLeftRightIcon: React.FC<{ className?: string }> = ({ className = "h-5 w-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 1.657-1.343 3-3 3H5.25l-2.815 2.815A.75.75 0 011.5 17.25V6a3 3 0 013-3h15a3 3 0 013 3v6zM18.75 6v9m-13.5 0v.01" />
    </svg>
);
