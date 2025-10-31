export class WaveSpawnerSystem {
    constructor(wavePlanFactory, enemyStatFactories, onWaveComplete = null) {
        this.wavePlanFactory = wavePlanFactory;
        this.enemyStatFactories = enemyStatFactories;
        this.onWaveComplete = onWaveComplete;

        this.elapsedSeconds = 0;
        this.nextIndexToSpawn = 0;
        this.spawnPlan = [];
        this.isActive = false;
        this.waveNumber = 0;
    }
    startWave(gameState) {
        if (this.isActive) return;
        this.waveNumber = ++gameState.currentWaveNumber;
        const waveEntries = this.wavePlanFactory.makeWaveEntries(this.waveNumber);
        this.spawnPlan = waveEntries.flatMap((entry) =>
            Array.from({ length: entry.count }, (_, index) => ({
                enemyTypeKey: entry.enemyTypeKey,
                at: index * entry.spawnIntervalSeconds,
            }))
        );
        this.elapsedSeconds = 0;
        this.nextIndexToSpawn = 0;
        this.isActive = true;
    }
    tick(gameState, deltaSeconds) {
        if (!this.isActive) return;
        this.elapsedSeconds += deltaSeconds;
        while (
            this.nextIndexToSpawn < this.spawnPlan.length &&
            this.elapsedSeconds >= this.spawnPlan[this.nextIndexToSpawn].at
        ) {
            const plan = this.spawnPlan[this.nextIndexToSpawn];
            const statFactory = this.enemyStatFactories[plan.enemyTypeKey];
            const statBlock = statFactory(this.waveNumber);
            gameState.enemies.push(gameState.factories.createEnemy(statBlock));
            this.nextIndexToSpawn += 1;
        }
        if (this.nextIndexToSpawn >= this.spawnPlan.length && gameState.enemies.length === 0) {
            this.isActive = false;
            gameState.money += this.waveNumber * 10;

            if (typeof this.onWaveComplete === "function") {
                this.onWaveComplete(this.waveNumber, gameState);
            }
        }
    }
}