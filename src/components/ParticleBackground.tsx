import React from 'react';
import {
	AbsoluteFill,
	interpolate,
	useCurrentFrame,
} from 'remotion';

type ParticleBackgroundProps = {
	count?: number;
};

export const ParticleBackground: React.FC<
	ParticleBackgroundProps
> = ({count = 42}) => {
	const frame = useCurrentFrame();

	return (
		<AbsoluteFill
			style={{
				overflow: 'hidden',
				pointerEvents: 'none',
			}}
		>
			{Array.from({length: count}).map((_, i) => {
				const x = (i * 127) % 1920;
				const baseY = (i * 193) % 1080;
				const speed = 0.25 + (i % 5) * 0.08;

				const y =
					(baseY - frame * speed + 1400) % 1300 - 100;

				const opacity = interpolate(
					Math.sin((frame + i * 13) / 22),
					[-1, 1],
					[0.12, 0.75],
				);

				const size = 2 + (i % 4);

				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: x,
							top: y,
							width: size,
							height: size,
							borderRadius: '50%',
							backgroundColor: '#FFE500',
							boxShadow:
								'0 0 12px rgba(255,229,0,0.8)',
							opacity,
						}}
					/>
				);
			})}

			<div
				style={{
					position: 'absolute',
					inset: 0,
					background:
						'radial-gradient(circle at 50% 50%, rgba(255,229,0,0.05), transparent 55%)',
				}}
			/>
		</AbsoluteFill>
	);
};