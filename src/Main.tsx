import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {Scene1} from './scenes/Scene1';
import {Scene2} from './scenes/Scene2';
import {Scene3} from './scenes/Scene3';
import {Scene4} from './scenes/Scene4';
import {Scene5} from './scenes/Scene5';
import {Scene6} from './scenes/Scene6';

export const COLORS = {
	background: '#050505',
	yellow: '#FFE500',
	white: '#FFFFFF',
	muted: '#A8A8A8',
	card: 'rgba(255,255,255,0.06)',
	border: 'rgba(255,229,0,0.22)',
};

export const Main: React.FC = () => {
	return (
		<AbsoluteFill
			style={{
				backgroundColor: COLORS.background,
				fontFamily:
					'Inter, Arial, Helvetica, system-ui, sans-serif',
				color: COLORS.white,
				overflow: 'hidden',
			}}
		>
			<Sequence durationInFrames={120}>
				<Scene1 />
			</Sequence>

			<Sequence from={120} durationInFrames={150}>
				<Scene2 />
			</Sequence>

			<Sequence from={270} durationInFrames={180}>
				<Scene3 />
			</Sequence>

			<Sequence from={450} durationInFrames={180}>
				<Scene4 />
			</Sequence>

			<Sequence from={630} durationInFrames={150}>
				<Scene5 />
			</Sequence>

			<Sequence from={780} durationInFrames={120}>
				<Scene6 />
			</Sequence>
		</AbsoluteFill>
	);
};
