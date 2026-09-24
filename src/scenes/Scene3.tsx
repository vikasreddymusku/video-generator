import React from 'react';
import {
	AbsoluteFill,
	interpolate,
	useCurrentFrame,
} from 'remotion';
import {PipelineNode} from '../components/PipelineNode';
import {ParticleBackground} from '../components/ParticleBackground';

const nodes = [
	'DATA SOURCE',
	'S3',
	'AWS GLUE',
	'REDSHIFT',
	'ATHENA',
	'INSIGHTS',
];

export const Scene3: React.FC = () => {
	const frame = useCurrentFrame();

	return (
		<AbsoluteFill
			style={{
				padding: '100px 90px',
				boxSizing: 'border-box',
				background:
					'radial-gradient(circle at center, #181600 0%, #050505 62%)',
			}}
		>
			<ParticleBackground count={18} />

			<div
				style={{
					textAlign: 'center',
					fontSize: 30,
					letterSpacing: '0.24em',
					color: '#FFE500',
					fontWeight: 700,
				}}
			>
				FROM RAW DATA TO BUSINESS INSIGHT
			</div>

			<div
				style={{
					fontSize: 72,
					fontWeight: 900,
					textAlign: 'center',
					marginTop: 20,
				}}
			>
				THE DATA PIPELINE
			</div>

			<div
				style={{
					position: 'relative',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginTop: 180,
				}}
			>
				{nodes.map((node, index) => (
					<React.Fragment key={node}>
						<PipelineNode
							label={node}
							index={index}
						/>

						{index < nodes.length - 1 ? (
							<Connector
								index={index}
								frame={frame}
							/>
						) : null}
					</React.Fragment>
				))}
			</div>
		</AbsoluteFill>
	);
};

const Connector: React.FC<{
	index: number;
	frame: number;
}> = ({index, frame}) => {
	const progress = interpolate(
		frame - index * 18,
		[8, 30],
		[0, 1],
		{
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		},
	);

	const dotPosition = interpolate(
		(frame + index * 11) % 35,
		[0, 35],
		[0, 100],
	);

	return (
		<div
			style={{
				position: 'relative',
				flex: 1,
				height: 5,
				background:
					'rgba(255,229,0,0.18)',
				overflow: 'visible',
				opacity: progress,
			}}
		>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					transformOrigin: 'left',
					transform: `scaleX(${progress})`,
					background:
						'linear-gradient(90deg, #FFE500, rgba(255,229,0,0.35))',
					boxShadow:
						'0 0 16px rgba(255,229,0,0.7)',
				}}
			/>

			<div
				style={{
					position: 'absolute',
					left: `${dotPosition}%`,
					top: -5,
					width: 14,
					height: 14,
					borderRadius: '50%',
					backgroundColor: '#FFFFFF',
					boxShadow:
						'0 0 18px #FFE500',
				}}
			/>
		</div>
	);
};