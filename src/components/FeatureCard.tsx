import React from 'react';
import {
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';

type FeatureCardProps = {
	title: string;
	index: number;
	icon: string;
};

export const FeatureCard: React.FC<FeatureCardProps> = ({
	title,
	index,
	icon,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const delay = index * 7;
	const localFrame = Math.max(frame - delay, 0);

	const progress = spring({
		fps,
		frame: localFrame,
		config: {
			damping: 15,
			stiffness: 120,
			mass: 0.8,
		},
	});

	const opacity = interpolate(
		localFrame,
		[0, 12],
		[0, 1],
		{
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		},
	);

	return (
		<div
			style={{
				width: 300,
				height: 220,
				padding: 30,
				boxSizing: 'border-box',
				borderRadius: 28,
				border: '1px solid rgba(255,229,0,0.28)',
				background:
					'linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025))',
				boxShadow:
					'0 25px 70px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
				backdropFilter: 'blur(16px)',
				opacity,
				transform: `translateY(${(1 - progress) * 130}px) scale(${
					0.92 + progress * 0.08
				})`,
			}}
		>
			<div
				style={{
					width: 62,
					height: 62,
					borderRadius: 18,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: '#FFE500',
					color: '#050505',
					fontSize: 30,
					fontWeight: 900,
					marginBottom: 26,
					boxShadow:
						'0 0 40px rgba(255,229,0,0.22)',
				}}
			>
				{icon}
			</div>

			<div
				style={{
					fontSize: 25,
					fontWeight: 800,
					lineHeight: 1.2,
					letterSpacing: '-0.01em',
				}}
			>
				{title}
			</div>
		</div>
	);
};