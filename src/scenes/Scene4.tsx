import React from 'react';
import {AbsoluteFill} from 'remotion';
import {FeatureCard} from '../components/FeatureCard';
import {ParticleBackground} from '../components/ParticleBackground';

const features = [
	{
		title: 'HANDS-ON PROJECTS',
		icon: '01',
	},
	{
		title: 'REAL-WORLD DATA PIPELINES',
		icon: '02',
	},
	{
		title: 'EXPERT MENTORSHIP',
		icon: '03',
	},
	{
		title: 'INTERVIEW PREPARATION',
		icon: '04',
	},
	{
		title: 'CAREER SUPPORT',
		icon: '05',
	},
];

export const Scene4: React.FC = () => {
	return (
		<AbsoluteFill
			style={{
				padding: '95px 110px',
				boxSizing: 'border-box',
				background:
					'linear-gradient(180deg, #050505, #0d0d07)',
			}}
		>
			<ParticleBackground count={24} />

			<div
				style={{
					textAlign: 'center',
					fontSize: 30,
					color: '#FFE500',
					fontWeight: 700,
					letterSpacing: '0.22em',
				}}
			>
				MORE THAN JUST A COURSE
			</div>

			<div
				style={{
					fontSize: 76,
					fontWeight: 900,
					textAlign: 'center',
					marginTop: 20,
				}}
			>
				BUILD JOB-READY SKILLS
			</div>

			<div
				style={{
					marginTop: 120,
					display: 'flex',
					justifyContent: 'center',
					gap: 28,
				}}
			>
				{features.map((feature, index) => (
					<FeatureCard
						key={feature.title}
						title={feature.title}
						icon={feature.icon}
						index={index}
					/>
				))}
			</div>
		</AbsoluteFill>
	);
};