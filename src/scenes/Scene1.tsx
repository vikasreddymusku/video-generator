import React from 'react';
import {
	AbsoluteFill,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import {ParticleBackground} from '../components/ParticleBackground';

export const Scene1: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const logoProgress = spring({
		frame,
		fps,
		config: {
			damping: 14,
			stiffness: 120,
		},
	});

	const titleOpacity = interpolate(
		frame,
		[20, 45],
		[0, 1],
		{
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		},
	);

	const subtitleOpacity = interpolate(
		frame,
		[42, 68],
		[0, 1],
		{
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		},
	);

	const streakX = interpolate(
		frame,
		[0, 119],
		[-500, 2200],
	);

	return (
		<AbsoluteFill
			style={{
				background:
					'radial-gradient(circle at center, #191700 0%, #050505 58%)',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<ParticleBackground />

			<div
				style={{
					position: 'absolute',
					width: 800,
					height: 4,
					background:
						'linear-gradient(90deg, transparent, #FFE500, transparent)',
					filter: 'blur(3px)',
					transform: `translateX(${streakX}px) rotate(-8deg)`,
					opacity: 0.65,
				}}
			/>

			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 42,
					transform: `scale(${0.75 + logoProgress * 0.25})`,
				}}
			>
				<svg
					width="170"
					height="170"
					viewBox="0 0 170 170"
				>
					<polygon
						points="20,35 95,35 150,85 95,135 20,135 75,85"
						fill="#FFE500"
					/>
				</svg>

				<div>
					<div
						style={{
							fontSize: 104,
							fontWeight: 900,
							letterSpacing: '-0.05em',
							opacity: titleOpacity,
							transform: `translateX(${
								(1 - titleOpacity) * 50
							}px)`,
						}}
					>
						TINITIATE AI
					</div>

					<div
						style={{
							fontSize: 29,
							fontWeight: 600,
							letterSpacing: '0.34em',
							marginTop: 18,
							color: '#FFE500',
							opacity: subtitleOpacity,
						}}
					>
						LEARN. BUILD. LEAD THE FUTURE.
					</div>
				</div>
			</div>
		</AbsoluteFill>
	);
};