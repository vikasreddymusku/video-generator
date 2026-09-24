import React from 'react';
import {
	AbsoluteFill,
	interpolate,
	useCurrentFrame,
} from 'remotion';
import {ParticleBackground} from '../components/ParticleBackground';

export const Scene5: React.FC = () => {
	const frame = useCurrentFrame();

	const rotation = interpolate(
		frame,
		[0, 150],
		[0, 90],
	);

	const lineProgress = interpolate(
		frame,
		[20, 100],
		[0, 1],
		{
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		},
	);

	return (
		<AbsoluteFill
			style={{
				alignItems: 'center',
				justifyContent: 'center',
				background:
					'radial-gradient(circle, #171500 0%, #050505 65%)',
			}}
		>
			<ParticleBackground count={22} />

			<svg
				width="900"
				height="900"
				viewBox="0 0 900 900"
				style={{
					position: 'absolute',
					opacity: 0.16,
					transform: `rotate(${rotation}deg)`,
				}}
			>
				<circle
					cx="450"
					cy="450"
					r="380"
					fill="none"
					stroke="#FFE500"
					strokeWidth="2"
					strokeDasharray="20 30"
				/>
				<circle
					cx="450"
					cy="450"
					r="280"
					fill="none"
					stroke="#FFE500"
					strokeWidth="2"
					strokeDasharray="8 26"
				/>
				<line
					x1="450"
					y1="20"
					x2="450"
					y2="880"
					stroke="#FFE500"
				/>
				<line
					x1="20"
					y1="450"
					x2="880"
					y2="450"
					stroke="#FFE500"
				/>
			</svg>

			<div
				style={{
					zIndex: 2,
					textAlign: 'center',
				}}
			>
				<div
					style={{
						fontSize: 130,
						fontWeight: 900,
						letterSpacing: '-0.055em',
					}}
				>
					<span style={{color: '#FFE500'}}>
						LEARN.
					</span>{' '}
					BUILD.{' '}
					<span style={{color: '#FFE500'}}>
						GROW.
					</span>
				</div>

				<div
					style={{
						width: 1000,
						height: 4,
						background:
							'linear-gradient(90deg, transparent, #FFE500, transparent)',
						transform: `scaleX(${lineProgress})`,
						margin: '55px auto',
					}}
				/>

				<div
					style={{
						fontSize: 31,
						fontWeight: 600,
						letterSpacing: '0.16em',
						color: '#D6D6D6',
					}}
				>
					AWS&nbsp;&nbsp;•&nbsp;&nbsp;
					S3&nbsp;&nbsp;•&nbsp;&nbsp;
					GLUE&nbsp;&nbsp;•&nbsp;&nbsp;
					REDSHIFT&nbsp;&nbsp;•&nbsp;&nbsp;
					ATHENA&nbsp;&nbsp;•&nbsp;&nbsp;
					PYTHON&nbsp;&nbsp;•&nbsp;&nbsp;
					AIRFLOW
				</div>
			</div>
		</AbsoluteFill>
	);
};