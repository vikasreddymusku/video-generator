import React from 'react';
import {
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';

type PipelineNodeProps = {
	label: string;
	index: number;
};

export const PipelineNode: React.FC<PipelineNodeProps> = ({
	label,
	index,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const delay = index * 18;
	const localFrame = Math.max(frame - delay, 0);

	const progress = spring({
		frame: localFrame,
		fps,
		config: {
			damping: 14,
			stiffness: 130,
		},
	});

	const glow = interpolate(
		localFrame,
		[0, 15, 35],
		[0, 1, 0.55],
		{
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		},
	);

	return (
		<div
			style={{
				width: 220,
				height: 150,
				borderRadius: 26,
				border: `2px solid rgba(255,229,0,${
					0.25 + glow * 0.6
				})`,
				background:
					'linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025))',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				flexDirection: 'column',
				transform: `scale(${0.75 + progress * 0.25})`,
				opacity: progress,
				boxShadow: `0 0 ${20 + glow * 45}px rgba(255,229,0,${
					glow * 0.32
				})`,
			}}
		>
			<div
				style={{
					width: 32,
					height: 32,
					borderRadius: '50%',
					backgroundColor: '#FFE500',
					marginBottom: 17,
					boxShadow:
						'0 0 24px rgba(255,229,0,0.8)',
				}}
			/>

			<div
				style={{
					fontSize: 24,
					fontWeight: 800,
					textAlign: 'center',
				}}
			>
				{label}
			</div>
		</div>
	);
};