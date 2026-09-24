import React from 'react';
import {
	AbsoluteFill,
	interpolate,
	useCurrentFrame,
} from 'remotion';
import {ParticleBackground} from '../components/ParticleBackground';
import {Title} from '../components/Title';

export const Scene2: React.FC = () => {
	const frame = useCurrentFrame();

	const networkShift = interpolate(
		frame,
		[0, 150],
		[0, 120],
	);

	return (
		<AbsoluteFill
			style={{
				padding: '110px 140px',
				boxSizing: 'border-box',
				background:
					'linear-gradient(120deg, #050505 40%, #101000)',
			}}
		>
			<ParticleBackground count={26} />

			<svg
				style={{
					position: 'absolute',
					right: -40 + networkShift,
					top: 80,
					opacity: 0.32,
				}}
				width="930"
				height="850"
				viewBox="0 0 930 850"
			>
				{Array.from({length: 12}).map((_, i) => {
					const cx = 80 + ((i * 173) % 780);
					const cy = 80 + ((i * 127) % 660);

					return (
						<circle
							key={i}
							cx={cx}
							cy={cy}
							r={8 + (i % 3) * 3}
							fill="#FFE500"
						/>
					);
				})}

				{Array.from({length: 10}).map((_, i) => {
					const x1 = 80 + ((i * 173) % 780);
					const y1 = 80 + ((i * 127) % 660);
					const x2 =
						80 + (((i + 3) * 173) % 780);
					const y2 =
						80 + (((i + 3) * 127) % 660);

					return (
						<line
							key={i}
							x1={x1}
							y1={y1}
							x2={x2}
							y2={y2}
							stroke="#FFE500"
							strokeWidth="2"
							opacity="0.38"
						/>
					);
				})}
			</svg>

			<div
				style={{
					zIndex: 2,
					marginTop: 70,
				}}
			>
				<div
					style={{
						color: '#A9A9A9',
						fontSize: 31,
						letterSpacing: '0.26em',
						fontWeight: 600,
						marginBottom: 36,
					}}
				>
					BUILD YOUR CAREER IN
				</div>

				<Title
					text="AWS"
					color="#FFE500"
					fontSize={220}
				/>

				<div style={{height: 24}} />

				<Title
					text="DATA ENGINEERING"
					delay={12}
					fontSize={125}
				/>

				<div
					style={{
						marginTop: 48,
						width: 620,
						height: 4,
						background:
							'linear-gradient(90deg, #FFE500, transparent)',
					}}
				/>
			</div>
		</AbsoluteFill>
	);
};